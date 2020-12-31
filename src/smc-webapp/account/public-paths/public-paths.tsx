/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  redux,
  React,
  useActions,
  useState,
  useEffect,
  useIsMountedRef,
  useMemo,
  useTypedRedux,
} from "../../app-framework";
import { Table } from "antd";
import { PublicPath as PublicPath0 } from "smc-util/db-schema/public-paths";
import { trunc_middle } from "smc-util/misc";
import { webapp_client } from "../../webapp-client";
import { ErrorDisplay, Loading, TimeAgo } from "../../r_misc";
import { UnpublishEverything } from "./unpublish-everything";

interface PublicPath extends PublicPath0 {
  status?: string;
}

export const PublicPaths: React.FC = () => {
  const [data, set_data] = useState<PublicPath[] | undefined>(undefined);
  const [error, set_error] = useState<string>("");
  const [loading, set_loading] = useState<boolean>(false);
  const isMountedRef = useIsMountedRef();
  const project_map = useTypedRedux("projects", "project_map");
  const actions = useActions("projects");

  const paths: {
    published: PublicPath[];
    unlisted: PublicPath[];
    unpublished: PublicPath[];
  } = useMemo(() => {
    const published: PublicPath[] = [];
    const unlisted: PublicPath[] = [];
    const unpublished: PublicPath[] = [];

    if (data != null) {
      for (const path of data) {
        if (path.disabled) {
          unpublished.push(path);
          path.status = "Private (disabled)";
          continue;
        }
        if (path.unlisted) {
          unlisted.push(path);
          path.status = "Public (unlisted)";
          continue;
        }
        path.status = "Public (listed)";
        published.push(path);
      }
    }
    return { published, unlisted, unpublished };
  }, [data]);

  const COLUMNS = [
    {
      title: "Path",
      dataIndex: "path",
      key: "path",
      render: (path, record) => {
        return (
          <a
            onClick={async () => {
              await actions?.open_project({ project_id: record.project_id });
              redux
                .getProjectActions(record.project_id)
                ?.show_public_config(path);
            }}
          >
            {trunc_middle(path, 64)}
          </a>
        );
      },
    },
    {
      title: "Project",
      dataIndex: "project_id",
      key: "project_id",
      render: (project_id) => {
        const project = project_map?.get(project_id);
        if (project == null) {
          actions?.load_all_projects();
          return <Loading />;
        }
        const title = project.get("title") ?? "No Title";
        return (
          <a onClick={() => actions?.open_project({ project_id })}>
            {trunc_middle(title, 64)}
          </a>
        );
      },
    },
    {
      title: "Description",
      dataIndex: "description",
      key: "description",
      render: (description) => <span>{trunc_middle(description, 64)}</span>,
    },
    {
      title: "Last edited",
      dataIndex: "last_edited",
      key: "last_edited",
      render: (date) => <TimeAgo date={date} />,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
    },
  ];

  async function fetch() {
    set_loading(true);
    try {
      const data = (
        await webapp_client.async_query({
          query: {
            all_public_paths: {
              id: null,
              project_id: null,
              path: null,
              description: null,
              disabled: null,
              unlisted: null,
              license: null,
              last_edited: null,
              created: null,
              last_saved: null,
              counter: null,
              compute_image: null,
            },
          },
        })
      ).query.all_public_paths;
      if (!isMountedRef.current) {
        return;
      }
      set_loading(false);
      set_data(data);
      set_error("");
    } catch (err) {
      if (!isMountedRef.current) {
        return;
      }
      set_loading(false);
      set_error(err.toString());
    }
  }

  useEffect(() => {
    fetch();
  }, []);

  return (
    <div style={{ marginBottom: "64px" }}>
      <h2>Public files</h2>
      {loading && <Loading />}
      <br />
      {error != "" && <ErrorDisplay error={error} />}
      <br />
      {data != null && (
        <Table rowKey="id" columns={COLUMNS} dataSource={paths.published} />
      )}
      <UnpublishEverything data={data} />
    </div>
  );
};
