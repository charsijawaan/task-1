#!/usr/bin/env node

import Moralis from "moralis";
import {
  EvmChain,
  GetWalletTokenTransfersJSONResponse,
} from "@moralisweb3/common-evm-utils";
type Transaction = GetWalletTokenTransfersJSONResponse["result"][0];

const API_KEY = "";
const address = "";
const chain = EvmChain.BSC;

const main = async () => {
  await Moralis.start({
    apiKey: API_KEY,
  });

  const tokensResponse = await Moralis.EvmApi.token.getWalletTokenBalances({
    address,
    chain,
  });
  const tokens = tokensResponse.toJSON();

  console.log("Tokens found = ", tokens.length);

  let cursor: string | undefined = "";
  let transactions = [];
  do {
    const transactionsResponse =
      await Moralis.EvmApi.token.getWalletTokenTransfers({
        address,
        chain,
        limit: 100,
        cursor: cursor,
      });
    const transactionsJson = transactionsResponse.toJSON();
    for (const transaction of transactionsJson.result) {
      transactions.push(transaction);
    }
    cursor = transactionsResponse.pagination.cursor;
  } while (cursor != "" && cursor != null);

  console.log("Transactions found = ", transactions.length);

  const filteredTransactions = transactions.filter((transaction) => {
    return tokens.some(
      (token) =>
        token.symbol === transaction.token_symbol &&
        transaction.to_address === address
    );
  });

  const groupedTransactions: Record<string, Transaction[]> =
    filteredTransactions.reduce((acc, obj) => {
      const key = obj.token_symbol;
      if (!acc[key]) {
        acc[key] = [];
      }
      // @ts-ignore
      acc[key].push(obj);
      return acc;
    }, {} as Record<string, Transaction[]>);

  const tokenNames = Object.keys(groupedTransactions);
  for (let i = 0; i < tokenNames.length; i++) {
    const currKey = tokenNames[i];
    if (!currKey) continue;
    const transactions = groupedTransactions[currKey];
    if (!transactions?.length) continue;
    const results = await getResultsFromTokenTransactions(
      currKey,
      transactions
    );
    if (!results?.[0]) {
      continue;
    }
    console.log(`
      Token Name = ${currKey}\n
      Last Purchase Price = $${results?.[0]?.price} (${
      results?.[0]?.amount
    } Token's)\n
      Average Purchase Price = $${getAverage(results)}\n
    `);
  }
  process.exit(0);
};

const getAverage = (
  results:
    | {
        token: string;
        price: number;
        amount: string;
        priceFormatted?: string | undefined;
      }[]
    | null
) => {
  if (!results?.length) return null;
  const total = results.reduce((acc, curr) => {
    return acc + Number(curr.price);
  }, 0);
  return `${total / results.length}`;
};

const getResultsFromTokenTransactions = async (
  token: string,
  transactions: Transaction[]
) => {
  let results: {
    token: string;
    price: number;
    amount: string;
    priceFormatted?: string;
  }[] = [];
  try {
    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i];
      if (!transaction?.address || !transaction.block_number) {
        continue;
      }
      const price = (
        await Moralis.EvmApi.token.getTokenPrice({
          address: transaction.address,
          chain,
          toBlock: Number(transaction.block_number),
        })
      ).toJSON();
      results.push({
        token,
        price: Number(price.usdPrice),
        priceFormatted: price.usdPriceFormatted,
        amount: transaction.value_decimal as string,
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return results;
  } catch (ex) {
    return null;
  }
};

main().catch((err) => {
  console.log(err);
  process.exit(1);
});
