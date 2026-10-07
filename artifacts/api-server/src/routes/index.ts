import { Router, type IRouter } from "express";
import healthRouter from "./health";
import roadResqRouter from "./road-resq";

const router: IRouter = Router();

router.use(healthRouter);
router.use(roadResqRouter);

export default router;
