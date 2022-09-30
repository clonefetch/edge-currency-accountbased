/**
 * Created by on 2020-02-14
 */
/* global fetch */

import { EdgeCorePluginOptions, EdgeCurrencyInfo } from 'edge-core-js/types'

import { makeEosBasedPluginInner } from './eosPlugin'
import { EosJsConfig, EosSettings } from './eosTypes'

// ----TELOS MAIN NET----
export const eosJsConfig: EosJsConfig = {
  chainId: '4667b205c6838ef70ff7988f6e8257e8be0e1284a2f59699054a018f743b1d11', // Telos main net
  keyProvider: [],
  httpEndpoint: '', // main net
  fetch: fetch,
  verbose: false // verbose logging such as API activity
}

const denominations = [
  {
    name: 'TLOS',
    multiplier: '10000',
    symbol: 'T'
  }
]

const otherSettings: EosSettings = {
  // @ts-expect-error
  eosActivationServers: [
    'https://eospay.edge.app',
    'https://account.teloscrew.com'
  ],
  // used for the following routines, is Hyperion v2:

  // getIncomingTransactions
  // `/v2/history/get_transfers?to=${acct}&symbol=${currencyCode}&skip=${skip}&limit=${limit}&sort=desc`

  // getOutgoingTransactions
  // `/v2/history/get_actions?transfer.from=${acct}&transfer.symbol=${currencyCode}&skip=${skip}&limit=${limit}&sort=desc`

  // getKeyAccounts
  // `${server}/v2/state/get_key_accounts?public_key=${params[0]}`

  eosHyperionNodes: ['https://telos.caleos.io'],

  // used for eosjs fetch routines
  // getCurrencyBalance
  // getInfo
  // transaction
  eosNodes: ['https://telos.caleos.io'],
  eosFuelServers: [], // this will need to be fixed
  eosDfuseServers: [],
  uriProtocol: 'telos'
}

const defaultSettings: any = {
  otherSettings
}

export const telosCurrencyInfo: EdgeCurrencyInfo = {
  // Basic currency information:
  currencyCode: 'TLOS',
  displayName: 'Telos',
  pluginId: 'telos',
  // @ts-expect-error
  pluginName: 'telos',
  // do we need plugin name?
  walletType: 'wallet:telos',

  defaultSettings,

  memoMaxLength: 256,

  addressExplorer: 'https://telos.bloks.io/account/%s',
  transactionExplorer: 'https://telos.bloks.io/transaction/%s',

  denominations,
  metaTokens: []
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const makeTelosPlugin = (opts: EdgeCorePluginOptions) => {
  return makeEosBasedPluginInner(opts, telosCurrencyInfo, eosJsConfig)
}