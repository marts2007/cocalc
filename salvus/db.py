import psycopg2


def table_exists(cur, tablename):
    cur.execute("SELECT EXISTS(SELECT * FROM information_schema.tables WHERE table_name=%s)", (tablename,))
    return cur.fetchone()[0]

def empty_table(cur, tablename):
    cur.execute('DELETE FROM %s', (tablename,))

def init_tables(database):
    conn = psycopg2.connect(database)
    cur = conn.cursor()
    if not table_exists('services'):
        cur.execute("CREATE TABLE services (type varchar, site varchar, hostname varchar, port smallint)")
    
        
