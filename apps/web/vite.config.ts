import { defineConfig } from 'vite';
import { liveAssetPlugin } from './live-assets.mjs';

export default defineConfig(({command})=>({
 root:'apps/web',
 // On-demand lookup avoids indexing 180,000 frames before the first request.
 publicDir:command==='build'?'../../assets/web':false,
 plugins:command==='serve'?[liveAssetPlugin()]:[],
 // Prebundle the known dependency without crawling archived generated HTML.
 optimizeDeps:{noDiscovery:true,include:['pixi.js']},
 server:{host:'127.0.0.1',port:5173,strictPort:true,
  watch:{ignored:['**/assets/web','**/assets/web/**','**/.runtime','**/.runtime/**']},
  proxy:{'/ws':{target:process.env.MIR2_WEB_GATEWAY_TARGET??'ws://127.0.0.1:18800',ws:true}}},
 build:{outDir:'../../dist/web',emptyOutDir:true,rollupOptions:{input:[
  'apps/web/index.html','apps/web/map-lab.html','apps/web/actors.html','apps/web/scene-calibration.html',
  'apps/web/play.html','apps/web/perf.html','apps/web/ui-calibration.html','apps/web/resources.html']}}
}));
