/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import Stripe from "stripe";
import { EventEmitter } from "events";
import { Changes } from "./changefeed";
import { Client } from "pg";

export type QuerySelect = object;

export type QueryWhere =
  | { [field: string]: any }
  | { [field: string]: any }[]
  | string
  | string[];

// There are many more options still -- add them as needed.
export interface QueryOptions {
  select?: string | string[];
  table?: string;
  where?: QueryWhere;
  query?: string;
  set?: { [key: string]: any };
  params?: any[];
  values?: { [key: string]: any };
  jsonb_set?: object;
  jsonb_merge?: object;
  cache?: boolean;
  retry_until_success?: any; // todo
  offset?: number;
  limit?: number;
  timeout_s?: number;
  cb?: Function;
}

export interface AsyncQueryOptions extends Omit<QueryOptions, "cb"> {}

export type QueryResult = { [key: string]: any };

type CB = (err: string | Error, result: any) => any;

export interface ChangefeedOptions {
  table: string; // Name of the table
  select: { [field: string]: any }; // Map from field names to postgres data types. These must
  // determine entries of table (e.g., primary key).
  where: QueryWhere; // Condition involving only the fields in select; or function taking
  // obj with select and returning true or false
  watch: string[]; // Array of field names we watch for changes

  cb: CB;
}

export interface PostgreSQL extends EventEmitter {
  _dbg(desc: string): Function;

  _stop_listening(table: string, select: QuerySelect, watch: string[]);

  _query(opts: QueryOptions): void;

  _client(): Client | undefined;
  _clients: Client[] | undefined;

  is_standby: boolean;

  get_site_settings(opts: { cb: CB }): void;

  async_query(opts: AsyncQueryOptions): Promise<any>;

  _listen(table: string, select: QuerySelect, watch: string[], cb: CB): void;

  changefeed(opts: ChangefeedOptions): Changes;

  account_ids_to_usernames(opts: { account_ids: string[]; cb: CB }): void;

  get_project(opts: { project_id: string; columns?: string[]; cb: CB }): void;

  get_account(opts: { account_id: string; columns?: string[]; cb: CB }): void;

  add_user_to_project(opts: {
    account_id: string;
    project_id: string;
    group?: string;
    cb: CB;
  }): void;

  user_is_in_project_group(opts: {
    account_id: string;
    project_id: string;
    group?: string[];
    cache?: boolean;
    cb: CB;
  }): void;

  user_is_collaborator(opts: {
    account_id: string;
    project_id: string;
    cb: CB;
  });

  get_user_column(column: string, account_id: string, cb: CB);

  _get_project_column(column: string, project_id: string, cb: CB);

  do_account_creation_actions(opts: {
    email_address: string;
    account_id: string;
    cb: CB;
  }): void;

  mark_account_deleted(opts: {
    email_address: string;
    account_id: string;
    cb: CB;
  }): void;

  count_accounts_created_by(opts: {
    ip_address: string;
    age_s: number;
    cb: CB;
  }): void;

  account_exists(opts: { email_address: string; cb: CB }): void;

  is_banned_user(opts: {
    email_address?: string;
    account_id?: string;
    cb: CB;
  }): void;

  get_server_setting(opts: { name: string; cb: CB }): void;
  get_server_settings_cached(opts: { cb: CB }): void;
  server_settings_synctable(): any; // returns a table

  create_account(opts: {
    first_name: string;
    last_name: string;
    created_by?: string;
    email_address?: string;
    password_hash?: string;
    passport_strategy?: any;
    passport_id?: string;
    passport_profile?: any;
    usage_intent?: string;
    cb: CB;
  }): void;

  log(opts: { event: string; value: any; cb?: Function }): void;

  user_is_in_group(opts: { account_id: string; group: string; cb: CB }): void;

  sha1(...args): string;

  get_project_ids_with_user(opts: {
    account_id: string;
    is_owner?: boolean;
    cb: CB;
  }): void;

  get_remember_me(opts: { hash: string; cb: CB });
  save_remember_me(opts: {
    account_id: string;
    hash: string;
    value: string;
    ttl: number;
    cb: CB;
  });

  passport_exists(opts: { strategy: string; id: string; cb: CB });
  create_passport(opts: {
    account_id: string;
    strategy: string;
    id: string;
    profile: any; // complex object
    email_address?: string;
    first_name?: string;
    last_name?: string;
    cb: CB;
  });
  get_passport_settings(opts: { strategy: string; cb: CB });
  get_all_passport_settings(opts: { cb: CB });
  get_all_passport_settings_cached(opts: { cb: CB });

  change_password(opts: {
    account_id: string;
    password_hash: string;
    invalidate_remember_me?: boolean;
    cb: CB;
  });
  verify_email_check_token(opts: { email_address: string; token: string });
  reset_server_settings_cache(): void;

  stripe_update_customer(opts: {
    account_id: string;
    customer_id: string;
    stripe: Stripe;
    cb: CB;
  }): void;

  sync_site_license_subscriptions(account_id?: string): Promise<number>;

  get_stripe_customer_id(opts: { account_id: string; cb: CB }): void;

  set_stripe_customer_id(opts: {
    account_id: string;
    customer_id: string;
    cb: CB;
  }): void;

  update_coupon_history(opts: {
    account_id: string;
    coupon_history;
    cb: CB;
  }): void;

  get_coupon_history(opts: { account_id: string; cb: CB }): void;

  get_user_project_upgrades(opts: { account_id: string; cb: CB }): void;

  remove_all_user_project_upgrades(opts: {
    account_id: string;
    projects: string[];
    cb: CB;
  }): void;

  _concurrent_warn: number;

  concurrent(): number;

  register_hub(opts: {
    host: string;
    port: number;
    clients: number;
    ttl: number;
    cb: CB;
  }): void;
}
