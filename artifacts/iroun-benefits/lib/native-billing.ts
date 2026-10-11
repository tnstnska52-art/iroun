import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { PurchasesPackage } from 'react-native-purchases';
import type { Membership } from '@workspace/api-client-react';

function nativeReady(config:Membership){
  if(!config.configured) throw new Error('스토어 상품과 검증 제공자 설정 전입니다. 구매·복원을 진행하지 않았습니다.');
  if(Platform.OS==='web'||Constants.executionEnvironment===ExecutionEnvironment.StoreClient) throw new Error('정식 네이티브 개발 설치에서만 스토어 구매·복원을 확인할 수 있습니다. 웹·Expo Go에서는 구매하지 않습니다.');
  const product=Platform.OS==='ios'?config.products?.apple:config.products?.google;
  const apiKey=Platform.OS==='ios'?process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY:process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY;
  if(!product||!apiKey||!(Platform.OS==='ios'?apiKey.startsWith('appl_'):apiKey.startsWith('goog_'))) throw new Error('이 기기의 정식 스토어 상품·공개 SDK 키가 미연결입니다.');
  return {product,apiKey};
}
async function sdk(config:Membership,userId:string){
  const {apiKey,product}=nativeReady(config);
  if(!userId) throw new Error('로그인이 필요합니다.');
  // Lazy load avoids the vendor's web/Expo-Go simulated purchase implementation.
  const Purchases=(require('react-native-purchases') as typeof import('react-native-purchases')).default;
  if(!await Purchases.isConfigured()) Purchases.configure({apiKey,appUserID:userId});
  else if(await Purchases.getAppUserID()!==userId) await Purchases.logIn(userId);
  return {Purchases,product};
}
export async function loadMonthlyPackage(config:Membership,userId:string):Promise<PurchasesPackage>{
  const {Purchases,product}=await sdk(config,userId);
  const offerings=await Purchases.getOfferings();
  const p=offerings.current?.availablePackages.find(p=>p.packageType==='MONTHLY'&&p.product.identifier===product);
  if(!p?.product.priceString) throw new Error('스토어의 실제 월구독 상품·가격을 확인하지 못했습니다. 구매는 차단됩니다.');
  return p;
}
export async function nativePurchase(config:Membership,userId:string,p:PurchasesPackage){
  const {Purchases,product}=await sdk(config,userId);
  if(p.product.identifier!==product||p.packageType!=='MONTHLY') throw new Error('설정된 월구독 상품이 아닙니다.');
  await Purchases.purchasePackage(p);
  if(await Purchases.getAppUserID()!==userId) throw new Error('계정이 변경됐습니다. 다시 로그인하고 거래를 확인해 주세요.');
  // No entitlement is set here. The server must query the provider separately.
}
export async function nativeRestore(config:Membership,userId:string){
  const {Purchases}=await sdk(config,userId);
  await Purchases.restorePurchases();
  if(await Purchases.getAppUserID()!==userId) throw new Error('계정이 변경됐습니다.');
}
