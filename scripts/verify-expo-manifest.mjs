// Read-only checks. This is not a native simulator or signed-device test.
import assert from "node:assert/strict";
const host=process.env.REPLIT_EXPO_DEV_DOMAIN;
if(!host)throw new Error("Expo 개발 주소 없음");
const base=`https://${host}`;
for(const platform of ["ios","android"]){
  for(let attempt=1;attempt<=2;attempt++){
    const r=await fetch(base+"/",{headers:{"expo-platform":platform,accept:"application/expo+json,application/json"},signal:AbortSignal.timeout(30000)});
    assert.equal(r.status,200);
    const m=await r.json();
    const asset=new URL(m.launchAsset.url);
    assert.equal(asset.hostname,host);
    assert.equal(asset.protocol,"https:");
    assert.ok(m.runtimeVersion);
    console.log(JSON.stringify({platform,attempt,http:r.status,json:true,assetHostMatches:true}));
    if(attempt===1){
      const b=await fetch(asset,{signal:AbortSignal.timeout(90000)});
      assert.equal(b.status,200);
      assert.match(b.headers.get("content-type")??"",/javascript/);
      const bytes=(await b.arrayBuffer()).byteLength;
      assert.ok(bytes>100);
      console.log(JSON.stringify({platform,bundleHTTP:b.status,bytes,nativeExecutionChecked:false}));
    }
  }
}
const unsupported=await fetch(base+"/",{headers:{accept:"application/json","user-agent":"Exponent/2.35 CFNetwork iOS"},signal:AbortSignal.timeout(30000)});
console.log(JSON.stringify({case:"platform-absent-probe",http:unsupported.status,type:unsupported.headers.get("content-type"),actualUserRequestKnown:false}));
