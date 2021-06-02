/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useActions, useTypedRedux } from "../app-framework";
import { Button, Col, Row, Panel } from "../antd-bootstrap";
import { Icon, Space } from "../r_misc";
import { Subscription } from "./subscription";
import { AppliedCoupons, Customer } from "./types";
import { AddSubscription } from "./add-subscription";
import { PurchaseOneLicense } from "../site-licenses/purchase";
import { AboutLicenses } from "../account/licenses/about-licenses";

interface Props {
  customer?: Customer;
  selected_plan?: string;
  applied_coupons: AppliedCoupons;
  coupon_error?: string;
}

export const SubscriptionList: React.FC<Props> = ({
  customer,
  selected_plan,
  applied_coupons,
  coupon_error,
}) => {
  const state = useTypedRedux("billing", "subscription_list_state") ?? "view";
  function set_state(subscription_list_state) {
    actions.setState({ subscription_list_state });
  }
  const actions = useActions("billing");

  function close_buy_upgrades(): void {
    set_state("view");
    actions.set_selected_plan("");
    actions.remove_all_coupons();
  }

  function render_buy_license_button(): JSX.Element {
    return (
      <Button
        bsStyle="primary"
        disabled={state != "view"}
        onClick={() => set_state("buy_license")}
      >
        <Icon name="plus-circle" /> Buy a License...
      </Button>
    );
  }

  function render_buy_license(): JSX.Element {
    return (
      <div>
        <div style={{ fontSize: "11pt" }}>
          <AboutLicenses />
        </div>
        <br />
        <PurchaseOneLicense
          onClose={() => {
            set_state("view");
          }}
        />
      </div>
    );
  }

  function render_buy_upgrades_button(): JSX.Element {
    return (
      <Button
        bsStyle="primary"
        disabled={state != "view"}
        onClick={() => set_state("buy_upgrades")}
      >
        <Icon name="plus-circle" /> Buy Upgrades...
      </Button>
    );
  }

  function render_buy_upgrades(): JSX.Element {
    return (
      <div>
        <div style={{ fontSize: "14pt" }}>
          <i>
            The{" "}
            <a
              onClick={() => {
                set_state("buy_license");
              }}
            >
              new licenses
            </a>{" "}
            are vastly more flexible and affordable than upgrade packages, and
            you should{" "}
            <a
              onClick={() => {
                set_state("buy_license");
              }}
            >
              purchase a license
            </a>{" "}
            instead.
          </i>{" "}
          Upgrades are still available just in case you need one for a specific
          reason.
        </div>
        <br />
        <br />
        <AddSubscription
          on_close={close_buy_upgrades}
          selected_plan={selected_plan}
          applied_coupons={applied_coupons}
          coupon_error={coupon_error}
          customer={customer}
        />
      </div>
    );
  }

  function render_header(): JSX.Element {
    return (
      <Row>
        <Col sm={6}>
          <Icon name="list-alt" /> Subscriptions
        </Col>
        <Col sm={6}>
          <div style={{ float: "right" }}>
            {render_buy_license_button()}
            <Space /> {render_buy_upgrades_button()}
          </div>
        </Col>
      </Row>
    );
  }

  function render_subscriptions(): JSX.Element[] | JSX.Element | void {
    if (customer == null || customer.subscriptions == null) {
      return;
    }
    const v: JSX.Element[] = [];
    for (const sub of customer.subscriptions.data) {
      v.push(<Subscription key={sub.id} subscription={sub} />);
    }
    return v;
  }

  return (
    <Panel header={render_header()}>
      {state == "buy_upgrades" && render_buy_upgrades()}
      {state == "buy_license" && render_buy_license()}
      {state != "view" && <hr />}
      {render_subscriptions()}
    </Panel>
  );
};
