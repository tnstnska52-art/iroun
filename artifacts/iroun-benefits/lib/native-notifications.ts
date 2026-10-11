import { Platform } from 'react-native';
import Constants,{ExecutionEnvironment} from 'expo-constants';
import { registerNotificationDevice } from '@workspace/api-client-react';

/** Called only after a deliberate consent action. Does not send notifications. */
export async function registerNativeNotifications():Promise<string>{
  if(Platform.OS==='web'||Constants.executionEnvironment===ExecutionEnvironment.StoreClient) return '알림 설정은 저장했습니다. 실제 기기 등록은 네이티브 개발 설치에서 확인해야 합니다. 알림을 발송하지 않았습니다.';
  const projectId=Constants.expoConfig?.extra?.eas?.projectId||Constants.easConfig?.projectId||process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if(!projectId) return '알림 설정은 저장했습니다. 푸시 프로젝트가 미연결되어 기기 등록·발송은 하지 않았습니다.';
  const N=require('expo-notifications') as typeof import('expo-notifications');
  if(Platform.OS==='android') await N.setNotificationChannelAsync('deadline',{name:'혜택 마감 안내',importance:N.AndroidImportance.DEFAULT});
  let permission=await N.getPermissionsAsync();
  if(!permission.granted) permission=await N.requestPermissionsAsync();
  if(!permission.granted) return '기기에서 알림을 허용하지 않았습니다. 실제 알림은 받을 수 없습니다.';
  const token=(await N.getExpoPushTokenAsync({projectId})).data;
  return (await registerNotificationDevice({token})).message;
}
export function watchNotificationOpen(open:(id:string)=>void){
  if(Platform.OS==='web'||Constants.executionEnvironment===ExecutionEnvironment.StoreClient||
    !(Constants.expoConfig?.extra?.eas?.projectId||Constants.easConfig?.projectId||process.env.EXPO_PUBLIC_EAS_PROJECT_ID))return()=>{};
  const N=require('expo-notifications') as typeof import('expo-notifications');
  // Foreground display is an OS request, not proof that a device showed it.
  N.setNotificationHandler({handleNotification:async()=>({
    shouldShowBanner:true,shouldShowList:true,shouldPlaySound:true,shouldSetBadge:false,
  })});
  const seen=new Set<string>();
  const handle=(response:import('expo-notifications').NotificationResponse)=>{
    const key=response.notification.request.identifier;
    if(seen.has(key))return;
    seen.add(key);
    const id=response.notification.request.content.data?.benefitId;
    if(typeof id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(id))open(id);
  };
  const listener=N.addNotificationResponseReceivedListener(handle);
  // Also handle a tap that launched a previously closed app. Detail routes
  // recheck server authority; this is not proof of physical push delivery.
  let active=true;
  void N.getLastNotificationResponseAsync().then(response=>{
    if(active&&response){handle(response);void N.clearLastNotificationResponseAsync();}
  }).catch(()=>{});
  return()=>{active=false;listener.remove();};
}
