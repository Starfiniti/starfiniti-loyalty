(function (wp, wc) {
  "use strict";

  if (
    !wp ||
    !wp.element ||
    !wp.i18n ||
    !wp.plugins ||
    !wc ||
    !wc.blocksCheckout ||
    !wc.blocksCheckout.ExperimentalOrderMeta
  ) {
    return;
  }

  const { createElement: element } = wp.element;
  const { __, sprintf } = wp.i18n;
  const { registerPlugin } = wp.plugins;
  const { ExperimentalOrderMeta } = wc.blocksCheckout;

  function localAccountUrl(value) {
    if (typeof value !== "string" || value.length > 2048) {
      return "";
    }
    try {
      const url = new window.URL(value, window.location.href);
      return (url.protocol === "https:" || url.protocol === "http:") &&
        url.origin === window.location.origin
        ? url.href
        : "";
    } catch {
      return "";
    }
  }

  function LoyaltyPanel({ extensions, context }) {
    const data = extensions && extensions["starfiniti-loyalty"];
    const accountUrl = data && localAccountUrl(data.accountUrl);
    if (!data || data.version !== "1" || !accountUrl) {
      return null;
    }
    const location = context === "woocommerce/checkout" ? "checkout" : "cart";
    const titleId = `starfiniti-loyalty-${location}-title`;
    const stale = data.state !== "fresh";
    const children = [
      element(
        "div",
        { className: "starfiniti-loyalty-block-panel__header", key: "header" },
        element(
          "h3",
          { id: titleId, className: "starfiniti-loyalty-block-panel__title" },
          __("Loyalty rewards", "starfiniti-loyalty"),
        ),
        !stale &&
          element(
            "strong",
            { className: "starfiniti-loyalty-block-panel__balance" },
            sprintf(
              __("%s points available", "starfiniti-loyalty"),
              data.availablePoints,
            ),
          ),
      ),
    ];

    if (stale) {
      children.push(
        element(
          "p",
          { key: "stale" },
          __(
            "Your loyalty summary is refreshing. Open your secure loyalty account for the latest balance.",
            "starfiniti-loyalty",
          ),
        ),
      );
    } else {
      if (data.currentTierName) {
        children.push(
          element(
            "p",
            { className: "starfiniti-loyalty-block-panel__tier", key: "tier" },
            sprintf(
              __("VIP tier: %s", "starfiniti-loyalty"),
              data.currentTierName,
            ),
          ),
        );
      }
      if (Array.isArray(data.rewards) && data.rewards.length > 0) {
        children.push(
          element(
            "ul",
            {
              className: "starfiniti-loyalty-block-panel__rewards",
              key: "rewards",
            },
            data.rewards
              .slice(0, 3)
              .map((reward, index) =>
                element(
                  "li",
                  { key: `${reward.name}-${index}` },
                  sprintf(
                    __("%1$s — %2$s points", "starfiniti-loyalty"),
                    reward.name,
                    reward.costPoints,
                  ),
                ),
              ),
          ),
        );
      }
    }

    children.push(
      element(
        "a",
        {
          className: "starfiniti-loyalty-block-panel__link",
          href: accountUrl,
          key: "account",
        },
        __("View loyalty account", "starfiniti-loyalty"),
      ),
    );
    return element(
      "section",
      {
        "aria-labelledby": titleId,
        className: "starfiniti-loyalty-block-panel",
      },
      ...children,
    );
  }

  registerPlugin("starfiniti-loyalty", {
    render: function () {
      return element(ExperimentalOrderMeta, null, element(LoyaltyPanel));
    },
    scope: "woocommerce-checkout",
  });
})(window.wp, window.wc);
