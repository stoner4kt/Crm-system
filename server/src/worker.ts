import { httpServerHandler } from 'cloudflare:node';
import { createApp } from './app.js';

// Cloudflare Workers entry. Express is bridged to the Workers fetch runtime
// via the httpServerHandler from "cloudflare:node" (Node.js HTTP server
// compatibility). The app listens on an internal virtual port - no real TCP
// socket is created. See https://developers.cloudflare.com/workers/runtime-apis/nodejs/.
const app = createApp();

app.listen(3000);
export default httpServerHandler({ port: 3000 });