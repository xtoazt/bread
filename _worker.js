import { handleRequest } from './functions/proxy.js';

export async function onRequest({ request, env, ctx })

    return handleRequest(request, env, ctx);
  }
};
