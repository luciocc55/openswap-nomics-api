const express = require("express");
const { request, gql, rawRequest } = require("graphql-request");
const app = express();
const cors = require("cors");
const moment = require("moment");
app.set("port", 3500);
app.use(cors());
const graphUrl = "https://api.openswap.one/subgraphs/name/openswap/openswapv2";
const pairsQuery = gql`
  query getPairs($limit: Int!) {
    pairs(first: $limit, skip: 1) {
      id
      token0 {
        symbol
      }
      token1 {
        symbol
      }
    }
  }
`;
const tradesQuery = gql`
  query getSwaps($market: String!, $skip: Int!, $since: String) {
    swaps(
      first: 1000
      skip: $skip
      orderBy: timestamp
      where: { pair: $market, id_gt: $since }
    ) {
      id
      amountUSD
      timestamp
      amount0In
      amount0Out
      amount1In
      amount1Out
      pair {
        token0 {
          symbol
          tokenDayData(first: 1, orderBy: date, orderDirection: desc) {
            priceUSD
            date
          }
        }
        token1 {
          symbol
          tokenDayData(first: 1, orderBy: date, orderDirection: desc) {
            priceUSD
            date
          }
        }
      }
      transaction {
        id
      }
    }
  }
`;

function validateQuery(fields) {
  return (req, res, next) => {
    for (const field of fields) {
      if (!req.query[field]) {
        // Field isn't present, end request
        return res.status(400).send({ error: `Field ${field} is missing` });
      }
    }
    next(); // All fields are present, proceed
  };
}

app.get("/trades", validateQuery(["market"]), async function (req, res) {
  const totalTrades = [];
  let response = {};
  let skipNumber = 0;
  do {
    response = await request(graphUrl, tradesQuery, {
      market: req.query.market,
      since: req.query.since || "",
      skip: skipNumber,
    });
    totalTrades.push(...response.swaps);
    skipNumber = skipNumber + 1000;
  } while (response.swaps.length > 0);
  const nomicsMapped = totalTrades.map((element) => {
    return {
      id: element.id,
      timestamp: moment(parseInt(element.timestamp) * 1000).toISOString(),
      price: (
        parseFloat(element.pair.token0.tokenDayData[0].priceUSD) /
        parseFloat(element.pair.token1.tokenDayData[0].priceUSD)
      ).toString(),
      amount: element.amount0In === "0" ? element.amount1In : element.amount0In,
      amount_quote:
        element.amount0Out === "0" ? element.amount1Out : element.amount0Out,
      order: element.transaction.id,
      type: "market",
      side: element.amount0In === "0" ? "buy" : "sell",
      raw: element,
    };
  });
  res.status(200).send(nomicsMapped);
});
app.get("/markets", async function (req, res) {
  const response = await request(graphUrl, pairsQuery, { limit: 60 });
  const nomicsMapped = response.pairs.map((element) => {
    return {
      id: element.id,
      type: "spot",
      base: element.token0.symbol,
      quote: element.token1.symbol,
    };
  });
  res.status(200).send(nomicsMapped);
});

app.get("/info", function (req, res) {
  const response = {
    name: "OpenSwap",
    description:
      "OpenSwap is an audited DeFi protocol using Harmony network, with yield farming capabilities, simple-to-use user interface and cross-chain tools for bridging Harmony, Ethereum, and Binance Smart Chain networks.",
    location: "Switzerland",
    logo: "https://app.openswap.one/img/oswap_logo.5eef90b2.png",
    website: "https://app.openswap.one/",
    twitter: "https://twitter.com/OpenSwap_one/",
    version: "1.0",
    capability: {
      markets: true,
      trades: true,
      ordersSnapshot: false,
      candles: false,
      ticker: false,
    },
  };
  res.status(200).send(response);
});

app.listen(app.get("port"), async () => console.log(app.get("port")));
