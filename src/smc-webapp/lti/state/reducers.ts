import { Action, GlobalState, Route } from "./types";
import { assert_never } from "../helpers";

export function reducer(state: GlobalState, action: Action): GlobalState {
  switch (action.type) {
    case "initial_load":
      return {
        ...state,
        projects: action.projects || {},
        account_info: action.account_info,
        loading: false
      };
    case "open_project":
      return { ...state, route: Route.Project, opened_project_id: action.id };
    case "add_directory_listing":
      console.log("add_directory_listing reducer... action:", JSON.stringify(action))
      const file_listings = state.file_listings || {};
      console.log("file_listings:", file_listings)
      if (!file_listings[action.project_id]) {
        file_listings[action.project_id] = {};
      }
      const target_projects_file_listings = file_listings[action.project_id]
      console.log("target_project_listings", target_projects_file_listings)
      target_projects_file_listings[action.path] = action.listing.split("\n")
      console.log("Split paths:", action.listing.split("\n"))
      console.log("Split paths:", action.listing.split("\n"))
      return { ...state, file_listings}
    default:
      return assert_never(action);
  }
}