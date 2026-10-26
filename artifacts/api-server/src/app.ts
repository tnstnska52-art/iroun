import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import publicLeadsRouter from "./routes/public-leads";
import { logger } from "./lib/logger";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { clerkProxyMiddleware, CLERK_PROXY_PATH, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";
import { benefitsRouter } from "./routes/benefits";
import { companyRouter } from "./routes/company";
import { fundsRouter } from "./routes/funds";
import { documentsRouter } from "./routes/documents";
import healthRouter from "./routes/health";
import { mountPublicPages } from "./lib/public-pages";

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
// 주소를 브라우저로 직접 열었을 때 보이는 안내(앱 전용 서버라 화면은 없다).
// 스토어 등록용 공개 안내(개인정보처리방침·약관·계정 삭제·고객 지원).
mountPublicPages(app);
app.get(["/","/robots.txt"],(req,res)=>{
  if(req.path==="/robots.txt"){res.type("text/plain").send("User-agent: *\nAllow: /privacy\nAllow: /terms\nAllow: /delete-account\nAllow: /support\nDisallow: /\n");return;}
  res.type("text/plain; charset=utf-8").send(`이로운사람들 앱 서버가 켜져 있어요.\n로그인 설정: ${process.env.CLERK_SECRET_KEY?"됨":"아직 안 됨 (CLERK 키 필요)"}`);
});
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({credentials:true,origin:true}));
app.use(express.json({limit:"256kb"}));
app.use(express.urlencoded({ extended: true }));
app.use(clerkMiddleware(req=>({
  publishableKey:publishableKeyFromHost(getClerkProxyHost(req)??"",process.env.CLERK_PUBLISHABLE_KEY),
})));

app.use("/api", router);
app.use("/api", publicLeadsRouter);
// Company router keeps /service and /office prefixes; public endpoints stay public.
app.use("/api", (req,res,next)=>/^\/(service\/documents|office\/documents|office\/customers\/[^/]+\/documents)(\/|$)/.test(req.path)?documentsRouter(req,res,next):next());
app.use("/api", (req,res,next)=>/^\/(fund\/|office\/fund-leads)/.test(req.path)?fundsRouter(req,res,next):next());
app.use("/api", (req,res,next)=>/^\/(service|office)(\/|$)/.test(req.path)?companyRouter(req,res,next):next());
app.use("/api", benefitsRouter);

export default app;
