const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=process.cwd();const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'ledger-auth-'));
execFileSync(path.join(root,'node_modules/.bin/tsc'),['lib/auth.ts','--outDir',temporary,'--module','commonjs','--target','ES2022','--skipLibCheck','--ignoreConfig','--types','node']);
const auth=require(path.join(temporary,'auth.js'));
test.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
const secret='x'.repeat(40);
const env={GOOGLE_CLIENT_ID:'client.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'s',AUTH_SECRET:secret,ALLOWED_EMAILS:' Owner@Example.com, partner@example.com '};

test('mode: local without config, locked when partial or on Vercel',()=>{
  assert.equal(auth.authConfig({}).mode,'local');
  assert.deepEqual(auth.authConfig({VERCEL:'1'}),{mode:'misconfigured',missing:[...auth.REQUIRED_ENV]});
  assert.deepEqual(auth.authConfig({GOOGLE_CLIENT_ID:'a'}).missing,['GOOGLE_CLIENT_SECRET','AUTH_SECRET','ALLOWED_EMAILS']);
  assert.equal(auth.authConfig({...env,AUTH_SECRET:'short'}).mode,'misconfigured');
  const config=auth.authConfig({...env,AUTH_URL:'https://ledger.example.com/'});
  assert.equal(config.mode,'google');assert.deepEqual([...config.allowed],['owner@example.com','partner@example.com']);assert.equal(config.baseUrl,'https://ledger.example.com');
});

test('session accepts allow-listed users only and rejects tampering, expiry and purpose swaps',()=>{
  const config=auth.authConfig(env);const now=Date.UTC(2026,10,8);
  const token=auth.createSession({email:'OWNER@example.com',name:'Owner'},secret,now);
  assert.deepEqual(auth.readSession(token,config,now),{email:'owner@example.com',name:'Owner'});
  assert.equal(auth.readSession(token,config,now+auth.SESSION_SECONDS*1000+1),null);
  assert.equal(auth.readSession(token,auth.authConfig({...env,ALLOWED_EMAILS:'partner@example.com'}),now),null);
  assert.equal(auth.readSession(token,auth.authConfig({...env,AUTH_SECRET:'y'.repeat(40)}),now),null);
  const [payload,signature]=token.split('.');
  const forged=Buffer.from(JSON.stringify({email:'partner@example.com',name:'x',exp:9e9})).toString('base64url');
  assert.equal(auth.readSession(forged+'.'+signature,config,now),null);
  assert.equal(auth.readSession(payload+'.'+signature+'.x',config,now),null);
  assert.equal(auth.readSession(auth.seal({email:'owner@example.com',name:'O'},secret,'oauth',600,now),config,now),null);
  assert.equal(auth.readSession(undefined,config,now),null);
  assert.equal(auth.readSession(token,auth.authConfig({}),now),null);
});

test('ID token claims: issuer, audience, expiry, nonce and verified email',()=>{
  const now=Date.UTC(2026,10,8);const good={iss:'https://accounts.google.com',aud:env.GOOGLE_CLIENT_ID,exp:now/1000+60,nonce:'n1',email:'Owner@Example.com',email_verified:true,name:'Owner'};
  const expected={clientId:env.GOOGLE_CLIENT_ID,nonce:'n1'};
  assert.deepEqual(auth.validateIdToken(good,expected,now),{email:'owner@example.com',name:'Owner'});
  for(const change of [{iss:'https://evil.example'},{aud:'other'},{exp:now/1000-1},{nonce:'n2'},{nonce:undefined},{email_verified:false},{email:undefined}])
    assert.equal(auth.validateIdToken({...good,...change},expected,now),null,JSON.stringify(change));
  const jwt=['e30',Buffer.from(JSON.stringify(good)).toString('base64url'),'sig'].join('.');
  assert.deepEqual(auth.decodeJwtPayload(jwt),good);assert.equal(auth.decodeJwtPayload('bad'),null);
});

test('PKCE challenge matches RFC 7636 example',()=>{
  assert.equal(auth.pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});
