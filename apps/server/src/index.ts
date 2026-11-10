import { app } from './app';

const port = Number(process.env.PORT) || 3001;
const host = '0.0.0.0';

app.listen(port, host, () => {
  console.log(`Drop server listening on ${host}:${port}`);
});
