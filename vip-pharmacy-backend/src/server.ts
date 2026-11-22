import { config } from './config.js';
import { app } from './app';


app.listen(config.port, () => {
  console.log(`VIP Pharmacy API is running: http://localhost:${config.port}/api/v1/health`);
});
