import { div, toFixed } from 'biggystring'
import {
  EdgeCorePluginOptions,
  EdgeCurrencyEngine,
  EdgeCurrencyEngineOptions,
  EdgeCurrencyInfo,
  EdgeCurrencyPlugin,
  EdgeCurrencyTools,
  EdgeEncodeUri,
  EdgeIo,
  EdgeLog,
  EdgeParsedUri,
  EdgeToken,
  EdgeWalletInfo
} from 'edge-core-js/types'
import EosApi from 'eosjs-api'
import ecc from 'eosjs-ecc'

import { makeOtherMethods } from '../common/innerPlugin'
import { encodeUriCommon, parseUriCommon } from '../common/uriHelpers'
import { asyncWaterfall, getDenomInfo, getFetchCors } from '../common/utils'
import { EosEngine } from './eosEngine'
import {
  asGetActivationCost,
  asGetActivationSupportedCurrencies
} from './eosSchema'
import { EosNetworkInfo } from './eosTypes'

export function checkAddress(address: string): boolean {
  return /^[a-z0-9.]{1,12}$/.test(address)
}

export class EosTools implements EdgeCurrencyTools {
  eosServer: Object
  currencyInfo: EdgeCurrencyInfo
  io: EdgeIo
  log: EdgeLog
  networkInfo: EosNetworkInfo

  constructor(
    opts: EdgeCorePluginOptions,
    currencyInfo: EdgeCurrencyInfo,
    networkInfo: EosNetworkInfo
  ) {
    const { io, log } = opts
    this.io = io
    this.log = log
    this.currencyInfo = currencyInfo
    this.networkInfo = networkInfo

    this.eosServer = EosApi({
      chainId: networkInfo.chainId,
      fetch: getFetchCors(opts),
      httpEndpoint: this.networkInfo.eosNodes[0],
      keyProvider: [],
      verbose: false // verbose logging such as API activity
    })
  }

  async importPrivateKey(privateKey: string): Promise<Object> {
    const strippedPrivateKey = privateKey.replace(/ /g, '') // should be in WIF format
    if (strippedPrivateKey.length !== 51) {
      throw new Error('Private key wrong length')
    }
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!ecc.isValidPrivate(strippedPrivateKey)) {
      throw new Error('Invalid private key')
    }
    return {
      // best practice not to import owner key, only active
      // note that signing is done by active key (eosKey, not eosOwnerKey)
      eosKey: strippedPrivateKey // active private key
    }
  }

  async createPrivateKey(walletType: string): Promise<Object> {
    const type = walletType.replace('wallet:', '')

    const currencyInfoType = this.currencyInfo.walletType.replace('wallet:', '')
    if (type === currencyInfoType) {
      // TODO: User currency library to create private key as a string
      // Use io.random() for random number generation
      // Multiple keys can be created and stored here. ie. If there is both a mnemonic and key format,
      // Generate and store them here by returning an arbitrary object with them.
      let entropy = Buffer.from(this.io.random(32)).toString('hex')
      const eosOwnerKey = ecc.seedPrivate(entropy) // returns WIF format
      entropy = Buffer.from(this.io.random(32)).toString('hex')
      const eosKey = ecc.seedPrivate(entropy)
      return { eosOwnerKey, eosKey }
    } else {
      throw new Error('InvalidWalletType')
    }
  }

  async derivePublicKey(walletInfo: EdgeWalletInfo): Promise<Object> {
    const type = walletInfo.type.replace('wallet:', '')
    const currencyInfoType = this.currencyInfo.walletType.replace('wallet:', '')
    if (type === currencyInfoType) {
      // TODO: User currency library to derive the public keys/addresses from the private key.
      // Multiple keys can be generated and stored if needed. Do not store an HD chain
      // but rather just different versions of the master public key
      // const publicKey = derivePubkey(walletInfo.keys.eosKey)
      // const publicKey = deriveAddress(walletInfo.keys.eosKey)
      const publicKey = ecc.privateToPublic(walletInfo.keys.eosKey)
      let ownerPublicKey
      // usage of eosOwnerKey must be protected by conditional
      // checking for its existence
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (walletInfo.keys.eosOwnerKey) {
        ownerPublicKey = ecc.privateToPublic(walletInfo.keys.eosOwnerKey)
      }
      return { publicKey, ownerPublicKey }
    } else {
      throw new Error('InvalidWalletType')
    }
  }

  async parseUri(uri: string): Promise<EdgeParsedUri> {
    const { edgeParsedUri } = parseUriCommon(this.currencyInfo, uri, {
      [this.networkInfo.uriProtocol]: true
    })

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing
    const valid = checkAddress(edgeParsedUri.publicAddress || '')
    if (!valid) {
      throw new Error('InvalidPublicAddressError')
    }
    return edgeParsedUri
  }

  async encodeUri(obj: EdgeEncodeUri): Promise<string> {
    const valid = checkAddress(obj.publicAddress)
    if (!valid) {
      throw new Error('InvalidPublicAddressError')
    }
    let amount
    if (typeof obj.nativeAmount === 'string') {
      const currencyCode = this.currencyInfo.currencyCode
      const nativeAmount = obj.nativeAmount
      const denom = getDenomInfo(this.currencyInfo, currencyCode)
      if (denom == null) {
        throw new Error('InternalErrorInvalidCurrencyCode')
      }
      amount = div(nativeAmount, denom.multiplier, 4)
    }
    const encodedUri = encodeUriCommon(
      obj,
      this.networkInfo.uriProtocol,
      amount
    )
    return encodedUri
  }

  async getTokenId(token: EdgeToken): Promise<string> {
    const contractAddress = token?.networkLocation?.contractAddress
    if (contractAddress == null || !checkAddress(contractAddress)) {
      throw new Error('ErrorInvalidContractAddress')
    }
    return contractAddress.toLowerCase()
  }

  // change to fetch call in the future
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async getAccSystemStats(account: string) {
    return await new Promise((resolve, reject) => {
      // @ts-expect-error
      this.eosServer.getAccount(account, (error, result) => {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (error) {
          // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
          if (error.message.includes('unknown key')) {
            error.code = 'ErrorUnknownAccount'
          }
          reject(error)
        }
        resolve(result)
      })
    })
  }

  //
  // otherMethods
  //

  async getActivationSupportedCurrencies(): Promise<{
    result: { [code: string]: boolean }
  }> {
    try {
      const out = await asyncWaterfall(
        this.networkInfo.eosActivationServers.map(server => async () => {
          const uri = `${server}/api/v1/getSupportedCurrencies`
          const response = await fetch(uri)
          const result = await response.json()
          return {
            result
          }
        })
      )
      return asGetActivationSupportedCurrencies(out)
    } catch (e: any) {
      this.log.error(`UnableToGetSupportedCurrencies error: `, e)
      throw new Error('UnableToGetSupportedCurrencies')
    }
  }

  async getActivationCost(currencyCode: string): Promise<string | undefined> {
    try {
      const out = await asyncWaterfall(
        this.networkInfo.eosActivationServers.map(server => async () => {
          const uri = `${server}/api/v1/eosPrices/${currencyCode}`
          const response = await fetch(uri)
          const prices = asGetActivationCost(await response.json())
          const startingResourcesUri = `${server}/api/v1/startingResources/${currencyCode}`
          const startingResourcesResponse = await fetch(startingResourcesUri)
          const startingResources = asGetActivationCost(
            await startingResourcesResponse.json()
          )
          const totalEos =
            Number(prices.ram) * startingResources.ram +
            Number(prices.net) * startingResources.net +
            Number(prices.cpu) * startingResources.cpu
          const totalEosString = totalEos.toString()
          const price = toFixed(totalEosString, 0, 4)
          return price
        })
      )
      return out
    } catch (e: any) {
      this.log.error(`ErrorUnableToGetCost: `, e)
      throw new Error('ErrorUnableToGetCost')
    }
  }

  async validateAccount(
    account: string
  ): Promise<{ result: '' | 'AccountAvailable' }> {
    const valid = checkAddress(account) && account.length === 12
    const out: { result: '' | 'AccountAvailable' } = { result: '' }
    if (!valid) {
      const e = new Error('ErrorInvalidAccountName')
      e.name = 'ErrorInvalidAccountName'
      throw e
    }
    try {
      const result = await this.getAccSystemStats(account)
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (result) {
        const e = new Error('ErrorAccountUnavailable')
        e.name = 'ErrorAccountUnavailable'
        throw e
      }
      throw new Error('ErrorUnknownError')
    } catch (e: any) {
      if (e.code === 'ErrorUnknownAccount') {
        out.result = 'AccountAvailable'
      } else {
        throw e
      }
    }
    this.log(`validateAccount: result=${out.result}`)
    return out
  }
}

export function makeEosBasedPluginInner(
  opts: EdgeCorePluginOptions,
  currencyInfo: EdgeCurrencyInfo,
  networkInfo: EosNetworkInfo
): EdgeCurrencyPlugin {
  let toolsPromise: Promise<EosTools>
  async function makeCurrencyTools(): Promise<EosTools> {
    if (toolsPromise != null) return await toolsPromise
    toolsPromise = Promise.resolve(
      new EosTools(opts, currencyInfo, networkInfo)
    )
    return await toolsPromise
  }

  async function makeCurrencyEngine(
    walletInfo: EdgeWalletInfo,
    opts: EdgeCurrencyEngineOptions
  ): Promise<EdgeCurrencyEngine> {
    const tools = await makeCurrencyTools()
    const currencyEngine = new EosEngine(
      tools,
      walletInfo,
      opts,
      fetch,
      networkInfo
    )
    await currencyEngine.loadEngine(tools, walletInfo, opts)

    // @ts-expect-error
    currencyEngine.otherData = currencyEngine.walletLocalData.otherData
    // currencyEngine.otherData is an opaque utility object for use for currency
    // specific data that will be persisted to disk on this one device.
    // Commonly stored data would be last queried block height or nonce values for accounts
    // Edit the flow EosWalletOtherData and initialize those values here if they are
    // undefined
    // TODO: Initialize anything specific to this currency
    // if (!currencyEngine.otherData.nonce) currencyEngine.otherData.nonce = 0
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!currencyEngine.otherData.accountName) {
      currencyEngine.otherData.accountName = ''
    }
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!currencyEngine.otherData.lastQueryActionSeq) {
      currencyEngine.otherData.lastQueryActionSeq = {}
    }
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!currencyEngine.otherData.highestTxHeight) {
      currencyEngine.otherData.highestTxHeight = {}
    }

    const out: EdgeCurrencyEngine = currencyEngine
    return out
  }

  const otherMethods = makeOtherMethods(makeCurrencyTools, [
    'getActivationCost',
    'getActivationSupportedCurrencies',
    'validateAccount'
  ])

  return {
    currencyInfo,
    makeCurrencyEngine,
    makeCurrencyTools,
    otherMethods
  }
}
