import React, { useEffect,useState,useCallback } from 'react';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ClerkProvider } from '@clerk/expo';
import { koKR } from '@clerk/localizations';
import { tokenCache } from '@clerk/expo/token-cache';
import { setBaseUrl,getGetMeQueryKey,getGetRecommendationsQueryKey,getListBenefitsQueryKey } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { View,Text,ActivityIndicator,Platform } from 'react-native';
import { SettingsProvider } from '@/lib/settings';
import { AuthBridge, PERSONAL_KEYS } from '@/lib/session';
import { T } from '@/components/ui';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Replit 밖(로컬 PC·사내망)에서는 EXPO_PUBLIC_API_URL에 전체 주소(http 포함)를 넣는다.
// 값이 없으면 기존처럼 EXPO_PUBLIC_DOMAIN 앞에 https://를 붙인다.
const apiUrl = process.env.EXPO_PUBLIC_API_URL;
const domain = process.env.EXPO_PUBLIC_DOMAIN;
if (apiUrl && /^https?:\/\//.test(apiUrl)) setBaseUrl(apiUrl);
else if (domain) setBaseUrl(`https://${domain}`);

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const proxyUrl = process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined;

// 만료된 접근(401) 시 개인 캐시를 즉시 비운다. 추천 결과는 영구 저장하지 않는다(gcTime 0).
function wipePersonal(error: unknown) {
  const status=(error as {status?:number}|null)?.status;
  if(status===403) {
    // Refetch authority and erase retained recommendation responses. A 403 from
    // an admin form must not revoke an unrelated customer's valid membership.
    void queryClient.invalidateQueries({queryKey:getGetMeQueryKey()});
    void queryClient.cancelQueries({queryKey:getGetRecommendationsQueryKey()}).then(()=>{
      queryClient.removeQueries({queryKey:getGetRecommendationsQueryKey()});
    });
  }
  if (status === 401 || status===410) {
    for (const k of PERSONAL_KEYS()) queryClient.removeQueries({ queryKey: k as unknown as unknown[] });
  }
}
const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: wipePersonal }),
  mutationCache: new MutationCache({ onError: wipePersonal }),
  defaultOptions: {
    queries: { staleTime: 0, gcTime: 0, refetchOnWindowFocus: true, refetchOnReconnect: true, retry: 1 },
  },
});
// 공고 목록은 개인정보가 없는 공개 자료라 화면을 옮길 때마다 다시 받지 않는다(실기기 버벅임 원인).
queryClient.setQueryDefaults(getListBenefitsQueryKey(), { staleTime: 10 * 60_000, gcTime: 60 * 60_000, refetchOnWindowFocus: false });

function RootLayoutNav() {
  useWebSwipeBack();
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" options={{ presentation: 'transparentModal', animation: 'slide_from_bottom', contentStyle: { backgroundColor: 'transparent' } }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [childMounted,setChildMounted]=useState(false);
  const onChildMounted=useCallback(()=>setChildMounted(true),[]);
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    // 휴대폰 앱에서는 Pretendard를 파일로 싣는다(웹 미리보기는 따로 불러온다).
    ...(Platform.OS !== 'web' ? {
      'Pretendard-Regular': require('../assets/fonts/Pretendard-Regular.otf'),
      'Pretendard-Medium': require('../assets/fonts/Pretendard-Medium.otf'),
      'Pretendard-SemiBold': require('../assets/fonts/Pretendard-SemiBold.otf'),
      'Pretendard-Bold': require('../assets/fonts/Pretendard-Bold.otf'),
      'Pretendard-ExtraBold': require('../assets/fonts/Pretendard-ExtraBold.otf'),
    } : {}),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return <Startup />;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <SettingsProvider>
                <StatusBar style="dark" />
                {publishableKey ? (
                  <>
                  {!childMounted&&<View style={{position:'absolute',inset:0,zIndex:100}}><Startup /></View>}
                  <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache} proxyUrl={proxyUrl} localization={koKR}>
                    <AuthBridge onMounted={onChildMounted} />
                    <RootLayoutNav />
                  </ClerkProvider>
                  </>
                ) : (
                  <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
                    <T v="title">로그인 설정이 필요합니다</T>
                    <T>앱 로그인 키가 설정되지 않아 시작할 수 없습니다. 관리자에게 문의해 주세요.</T>
                  </View>
                )}
              </SettingsProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
function Startup(){
  return <View style={{flex:1,backgroundColor:'#f8fafc',padding:24,justifyContent:'center',alignItems:'center',gap:20}}>
    <Text style={{fontSize:28,fontWeight:'700',color:'#155eef'}} accessibilityRole="header">이로운사람들</Text>
    <ActivityIndicator size="large" color="#155eef" accessibilityLabel="화면 준비 중" />
    <Text style={{fontSize:20,lineHeight:30,color:'#334155',textAlign:'center'}}>화면을 준비하고 있습니다.{'\n'}시간이 오래 걸리면 인터넷 연결을 확인해 주세요.</Text>
  </View>;
}

/**
 * 웹 화면에서도 휴대폰처럼 화면 왼쪽 끝에서 오른쪽으로 밀면 이전 화면으로 돌아간다.
 * (아이폰·갤럭시 앱에서는 기기 자체의 밀기 동작이 그대로 작동한다.)
 * 화면이 직접 처리하고 싶으면 'iroun:back' 이벤트를 막으면 된다(예: 질문을 한 단계 뒤로).
 */
export function useWebSwipeBack() {
  const router = useRouter();
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    let sx = 0, sy = 0, st = 0, on = false, popped = false;
    // 브라우저가 스스로 뒤로 가는 경우(아이폰 사파리 등)에는 두 번 가지 않도록 기다렸다가 확인한다.
    const pop = () => { popped = true; };
    const start = (e: TouchEvent) => { const t = e.touches[0]; on = e.touches.length === 1 && t.clientX <= 36; sx = t.clientX; sy = t.clientY; st = Date.now(); popped = false; };
    const end = (e: TouchEvent) => {
      if (!on) return; on = false;
      const t = e.changedTouches[0], dx = t.clientX - sx, dy = Math.abs(t.clientY - sy);
      if (dx < 70 || dy > 60 || Date.now() - st > 900) return;
      setTimeout(() => {
        if (popped) return;
        const ev = new Event('iroun:back', { cancelable: true });
        if (window.dispatchEvent(ev) && router.canGoBack()) router.back();
      }, 320);
    };
    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchend', end, { passive: true });
    window.addEventListener('popstate', pop);
    return () => { document.removeEventListener('touchstart', start); document.removeEventListener('touchend', end); window.removeEventListener('popstate', pop); };
  }, [router]);
}
