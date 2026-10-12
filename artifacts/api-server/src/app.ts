import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { clerkProxyMiddleware, CLERK_PROXY_PATH, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";
import { benefitsRouter } from "./routes/benefits";
import { companyRouter } from "./routes/company";
import { fundsRouter } from "./routes/funds";
import { documentsRouter } from "./routes/documents";
import healthRouter from "./routes/health";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// 서버 상태 확인은 로그인 설정과 상관없이 응답한다(서버 업체의 자동 점검용).
app.use("/api", healthRouter);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({credentials:true,origin:true}));
app.use(express.json({limit:"256kb"}));
app.use(express.urlencoded({ extended: true }));
app.use(clerkMiddleware(req=>({
  publishableKey:publishableKeyFromHost(getClerkProxyHost(req)??"",process.env.CLERK_PUBLISHABLE_KEY),
})));

app.use("/api", router);
// Company router keeps /service and /office prefixes; public endpoints stay public.
app.use("/api", (req,res,next)=>/^\/(service\/documents|office\/documents|office\/customers\/[^/]+\/documents)(\/|$)/.test(req.path)?documentsRouter(req,res,next):next());
app.use("/api", (req,res,next)=>/^\/(fund\/|office\/fund-leads)/.test(req.path)?fundsRouter(req,res,next):next());
app.use("/api", (req,res,next)=>/^\/(service|office)(\/|$)/.test(req.path)?companyRouter(req,res,next):next());
app.use("/api", benefitsRouter);

export default app;
