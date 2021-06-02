#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

# The Hub's HTTP Server

fs           = require('fs')
path_module  = require('path')
Cookies      = require('cookies')
util         = require('util')
ms           = require('ms')

async        = require('async')
cookieParser = require('cookie-parser')
body_parser  = require('body-parser')
express      = require('express')
http_proxy   = require('http-proxy')
http         = require('http')
winston      = require('winston')

winston      = require('./winston-metrics').get_logger('hub_http_server')

misc         = require('smc-util/misc')
{defaults, required} = misc
misc_node    = require('smc-util-node/misc_node')
hub_register = require('./hub_register')
auth         = require('./auth')
access       = require('./access')
hub_projects = require('./projects')
MetricsRecorder  = require('./metrics-recorder')
{WebappConfiguration} = require('./webapp-configuration')

{http_message_api_v1} = require('./api/handler')
{setup_analytics_js} = require('./analytics')
{have_active_registration_tokens} = require("./utils");
{setup_healthchecks} = require('./healthchecks')
manifest = require('./manifest')

open_cocalc = require('./open-cocalc-server')

SMC_ROOT    = process.env.SMC_ROOT
STATIC_PATH = path_module.join(SMC_ROOT, 'static')
WEBAPP_RES_PATH = path_module.join(SMC_ROOT, 'webapp-lib', 'resources')


exports.init_express_http_server = (opts) ->
    opts = defaults opts,
        base_url       : required
        dev            : false       # if true, serve additional dev stuff, e.g., a proxyserver.
        is_personal       : false       # if true, includes that is in personal mode in customize info (so frontend can take this into account).
        database       : required
        compute_server : required
        cookie_options : undefined   # they're for the new behavior (legacy fallback implemented below)
    winston.debug("initializing express http server")

    if opts.database.is_standby
        server_settings = undefined
    else
        server_settings = require('./server-settings')(opts.database)

    # Create an express application
    router = express.Router()
    app    = express()
    http_server = http.createServer(app)
    app.use(cookieParser())
    webapp_config = new WebappConfiguration(db:opts.database)

    # Enable compression, as
    # suggested by http://expressjs.com/en/advanced/best-practice-performance.html#use-gzip-compression
    # NOTE "Express runs everything in order" -- https://github.com/expressjs/compression/issues/35#issuecomment-77076170
    compression = require('compression')
    app.use(compression())

    # Very large limit, since can be used to send, e.g., large single patches, and
    # the default is only 100kb!  https://github.com/expressjs/body-parser#limit-2
    router.use(body_parser.json({limit: '3mb'}))
    router.use(body_parser.urlencoded({extended: true, limit: '3mb'}))

    # initialize metrics
    response_time_histogram = MetricsRecorder.new_histogram('http_histogram', 'http server'
                                  buckets : [0.01, 0.1, 1, 2, 5, 10, 20]
                                  labels: ['path', 'method', 'code']
                              )
    # response time metrics
    router.use (req, res, next) ->
        res_finished_h = response_time_histogram.startTimer()
        original_end = res.end
        res.end = ->
            original_end.apply(res, arguments)
            {dirname}   = require('path')
            path_split  = req.path.split('/')
            # for API paths, we want to have data for each endpoint
            path_tail   = path_split[path_split.length-3 ..]
            is_api      = path_tail[0] == 'api' and path_tail[1] == 'v1'
            if is_api
                dir_path = path_tail.join('/')
            else
                # for regular paths, we ignore the file
                dir_path = dirname(req.path).split('/')[..1].join('/')
            #winston.debug('response timing/path_split:', path_tail, is_api, dir_path)
            res_finished_h({path:dir_path, method:req.method, code:res.statusCode})
        next()

    app.enable('trust proxy') # see http://stackoverflow.com/questions/10849687/express-js-how-to-get-remote-client-address

    # The webpack content. all files except for unhashed .html should be cached long-term ...
    cacheLongTerm = (res, path) ->
        if not opts.dev  # ... unless in dev mode
            timeout = ms('100 days') # more than a year would be invalid
            res.setHeader('Cache-Control', "public, max-age='#{timeout}'")
            res.setHeader('Expires', new Date(Date.now() + timeout).toUTCString());

    # robots.txt: disable indexing for published subdirectories, in particular to avoid a lot of 500/404 errors
    router.use '/robots.txt', (req, res) ->
        res.header("Content-Type", "text/plain")
        res.header('Cache-Control', 'private, no-cache, must-revalidate')
        res.write('''
                  User-agent: *
                  Allow: /share
                  Disallow: /*
                  ''')
        res.end()

    # setup the /analytics.js endpoint
    setup_analytics_js(router, opts.database, winston, opts.base_url)

    # setup all healthcheck endpoints
    setup_healthchecks(router:router, db:opts.database)

    # this is basically the "/" index page + assets, for docker, on-prem, dev, etc. calls itself "open cocalc"
    open_cocalc.setup_open_cocalc(app:app, router:router, db:opts.database, cacheLongTerm:cacheLongTerm, base_url:opts.base_url)

    # The /static content, used by docker, development, etc.
    router.use '/static',
        express.static(STATIC_PATH, setHeaders: cacheLongTerm)

    # This is webapp-lib/resources – cocalc serves everything it needs on its own. no info leaks, less dependency!
    router.use '/res',
        express.static(WEBAPP_RES_PATH, setHeaders: cacheLongTerm)

    # docker and development needs this endpoint in addition to serving /static
    router.get '/app', (req, res) ->
        #res.cookie(opts.base_url + 'has_remember_me', 'true', { maxAge: 60*60*1000, httpOnly: false })
        res.sendFile(path_module.join(STATIC_PATH, 'app.html'), {maxAge: 0})

    # The base_url javascript, which sets the base_url for the client.
    router.get '/base_url.js', (req, res) ->
        res.send("window.app_base_url='#{opts.base_url}';")

    router.get '/metrics', (req, res) ->
        res.header("Content-Type", "text/plain")
        res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate')
        metricsRecorder = MetricsRecorder.get()
        if metricsRecorder?
            # res.send(JSON.stringify(opts.metricsRecorder.get(), null, 2))
            res.send(await metricsRecorder.metrics())
        else
            res.send(JSON.stringify(error:'Metrics recorder not initialized.'))

    # HTTP API
    router.post '/api/v1/*', (req, res) ->
        h = req.header('Authorization')
        if not h?
            res.status(400).send(error:'You must provide authentication via an API key.')
            return
        [type, user] = misc.split(h)
        switch type
            when "Bearer"
                api_key = user
            when "Basic"
                api_key = new Buffer.from(user, 'base64').toString().split(':')[0]
            else
                res.status(400).send(error:"Unknown authorization type '#{type}'")
                return

        http_message_api_v1
            event          : req.path.slice(req.path.lastIndexOf('/') + 1)
            body           : req.body
            api_key        : api_key
            logger         : winston
            database       : opts.database
            compute_server : opts.compute_server
            ip_address     : req.ip
            cb      : (err, resp) ->
                if err
                    res.status(400).send(error:err)  # Bad Request
                else
                    res.send(resp)

    # stripe invoices:  /invoice/[invoice_id].pdf
    # Now deprecated, since stripe provides this as a service now!
    router.get '/invoice/*', (req, res) ->
        res.status(404).send("stripe invoice endpoint is deprecated")

    # return uuid-indexed blobs (mainly used for graphics)
    router.get '/blobs/*', (req, res) ->
        #winston.debug("blob (hub --> client): #{misc.to_json(req.query)}, #{req.path}")
        if not misc.is_valid_uuid_string(req.query.uuid)
            res.status(404).send("invalid uuid=#{req.query.uuid}")
            return
        if not hub_register.database_is_working()
            res.status(404).send("can't get blob -- not connected to database")
            return
        opts.database.get_blob
            uuid : req.query.uuid
            cb   : (err, data) ->
                if err
                    res.status(500).send("internal error: #{err}")
                else if not data?
                    res.status(404).send("blob #{req.query.uuid} not found")
                else
                    filename = req.path.slice(req.path.lastIndexOf('/') + 1)
                    if req.query.download?
                        # tell browser to download the link as a file instead
                        # of displaying it in browser
                        res.attachment(filename)
                    else
                        res.type(filename)
                    res.send(data)

    # TODO: is this cookie trick dangerous in some surprising way?
    router.get '/cookies', (req, res) ->
        if req.query.set
            # TODO: implement expires as part of query?  not needed for now.
            maxAge = 1000*24*3600*30*6  # 6 months -- long is fine now since we support "sign out everywhere" ?
            # fallback, legacy behavior, don't set sameSite
            # https://web.dev/samesite-cookie-recipes/#handling-incompatible-clients

            winston.debug("hub_http_server/cookies #{req.query.set}=#{req.query.value}")
            if req.query.set.endsWith(auth.remember_me_cookie_name('', true))
                # legacy = true case, without sameSite
                cookies = new Cookies(req, res)
                conf = misc.copy_without(opts.cookie_options, ['sameSite'])
                conf = Object.assign(conf, {maxAge:maxAge})
            else
                cookies = new Cookies(req, res)
                conf = Object.assign({}, opts.cookie_options, {maxAge:maxAge})
            winston.debug("hub_http_server/cookies conf=#{JSON.stringify(conf)}")
            cookies.set(req.query.set, req.query.value, conf)
        res.end()

    # Used to determine whether or not a token is needed for
    # the user to create an account.
    # DEPRECATED: moved to /customize
    if server_settings?
        router.get '/registration', (req, res) ->
            if await have_active_registration_tokens(opts.database)
                res.json({token:true})
            else
                res.json({})

    if server_settings?
        router.get '/customize', (req, res) ->
            # if we're behind cloudflare, we expose the detected country in the client
            # use a lib like https://github.com/michaelwittig/node-i18n-iso-countries
            # to read the ISO 3166-1 Alpha 2 codes.
            # if it is unknown, the code will be XX and K1 is the Tor-Network.
            country = req.headers['cf-ipcountry'] ? 'XX'
            host = req.headers["host"]
            config = await webapp_config.get(host:host, country:country)
            if opts.is_personal
                config.configuration.is_personal = true
            if req.query.type == 'full'
                res.header("Content-Type", "text/javascript")
                mapping = '{configuration:window.CUSTOMIZE, registration:window.REGISTER, strategies:window.STRATEGIES}'
                res.send("(#{mapping} = Object.freeze(#{JSON.stringify(config)}))")
            else if req.query.type == 'manifest'
                manifest.send(res, config, opts.base_url)
            else
                # this is deprecated
                if req.query.type == 'embed'
                    res.header("Content-Type", "text/javascript")
                    res.send("window.CUSTOMIZE = Object.freeze(#{JSON.stringify(config.configuration)})")
                else
                    # even more deprecated
                    res.json(config)

    # Save other paths in # part of URL then redirect to the single page app.
    router.get ['/projects*', '/help*', '/settings*', '/admin*', '/dashboard*', '/notifications*'], (req, res) ->
        url = require('url')
        q = url.parse(req.url, true).search || "" # gives exactly "?key=value,key=..."
        res.redirect(opts.base_url + "/app#" + req.path.slice(1) + q)

    # Return global status information about CoCalc
    router.get '/stats', (req, res) ->
        if not hub_register.database_is_working()
            res.json({error:"not connected to database"})
            return
        opts.database.get_stats
            update : false   # never update in hub b/c too slow. instead, run $ hub --update_stats via a cronjob every minute
            ttl    : 30
            cb     : (err, stats) ->
                res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate')
                if err
                    res.status(500).send("internal error: #{err}")
                else
                    res.header("Content-Type", "application/json")
                    res.send(JSON.stringify(stats, null, 1))

    # Get the http server and return it.
    if opts.base_url
        app.use(opts.base_url, router)
    else
        app.use(router)

    if opts.dev
        dev = require('./dev/hub-http-server')
        await dev.init_http_proxy(app, opts.database, opts.base_url, opts.compute_server, winston, opts.is_personal)
        dev.init_websocket_proxy(http_server, opts.database, opts.base_url, opts.compute_server, winston, opts.is_personal)
        dev.init_share_server(app, opts.database, opts.base_url, winston);

    return {http_server:http_server, express_router:router}
