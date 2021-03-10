/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { omit } from "lodash";
import { PostgreSQL } from "./types";
import { callback2 } from "../smc-util/async-utils";
import { query } from "./query";

export async function project_has_network_access(
  db: PostgreSQL,
  project_id: string
): Promise<boolean> {
  let x;
  try {
    x = await callback2(db.get_project, {
      project_id,
      columns: ["users", "settings"],
    });
  } catch (err) {
    // error probably means there is no such project or project_id is badly formatted.
    return false;
  }
  if (x.settings != null && x.settings.network) {
    return true;
  }
  if (x.users != null) {
    for (const account_id in x.users) {
      if (
        x.users[account_id] != null &&
        x.users[account_id].upgrades != null &&
        x.users[account_id].upgrades.network
      ) {
        return true;
      }
    }
  }
  return false;
}

export async function project_datastore_set(
  _db: PostgreSQL,
  _project_id: string
): Promise<void> {}

export async function project_datastore_get(
  db: PostgreSQL,
  account_id: string,
  project_id: string
): Promise<any> {
  try {
    const q: { users: any; addons: any } = await query({
      db,
      table: "projects",
      select: ["addons", "users"],
      where: { project_id },
      one: true,
    });
    // TODO is this test necessary? given this comes from db-schema/projects.ts ?
    if (q.users[account_id] == null) throw Error(`access denied`);
    const ds = {};
    if (q.addons.datastore != null) {
      for (const [k, v] of Object.entries(q.addons.datastore)) {
        ds[k] = omit(v, "secret");
      }
    }
    return {
      addons: { datastore: ds },
    };
  } catch (err) {
    return { type: "error", error: err };
  }
}
