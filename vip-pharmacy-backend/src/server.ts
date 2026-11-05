import { config } from './config';
import { app } from './app';


app.listen(config.port, () => {
  console.log(`VIP Pharmacy API chal rahi hai: http://localhost:${config.port}/api/v1/health`);
});
