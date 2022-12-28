/* global */

import { EdgeCurrencyInfo } from 'edge-core-js/types'

import { makeOuterPlugin } from '../common/innerPlugin'
import { ZcashTools } from './zecPlugin'
import { ZcashNetworkInfo } from './zecTypes'

const networkInfo: ZcashNetworkInfo = {
  rpcNode: {
    networkName: 'mainnet',
    defaultHost: 'lightd1.pirate.black',
    defaultPort: 443
  },
  defaultBirthday: 2040000,
  defaultNetworkFee: '10000',
  nativeSdk: 'piratechain',
  transactionQueryLimit: 999
}

const currencyInfo: EdgeCurrencyInfo = {
  // Basic currency information:
  currencyCode: 'ARRR',
  displayName: 'Pirate Chain',
  pluginId: 'piratechain',
  requiredConfirmations: 10,
  walletType: 'wallet:piratechain',

  defaultSettings: {},

  addressExplorer: 'https://explorer.pirate.black/address/%s',
  transactionExplorer: 'https://explorer.pirate.black/tx/%s',

  denominations: [
    // An array of Objects of the possible denominations for this currency
    {
      name: 'ARRR',
      multiplier: '100000000',
      symbol: 'P'
    }
  ],
  metaTokens: []
}

export const piratechain = makeOuterPlugin<ZcashNetworkInfo, ZcashTools>({
  currencyInfo,
  networkInfo,

  async getInnerPlugin() {
    return await import('./zecPlugin')
  }
})