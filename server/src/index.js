import { createApp } from "./app.js";

const app = createApp();
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`made by kseniya API running on http://localhost:${PORT}`);
});

export default app;
