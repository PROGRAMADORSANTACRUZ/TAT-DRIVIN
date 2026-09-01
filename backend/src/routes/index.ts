import { Router } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import vehiculosRouter from "./vehiculos";
import conductoresRouter from "./conductores";
import ordenesRouter from "./ordenes";
import clientesRouter from "./clientes";
import clientesTatRouter from "./clientes-tat";
import planesRouter from "./planes";
import planillasRouter from "./planillas";
import novedadesRouter from "./novedades";
import configRouter from "./config";

const router = Router();

router.use("/health", healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/vehiculos", vehiculosRouter);
router.use("/conductores", conductoresRouter);
router.use("/ordenes", ordenesRouter);
router.use("/clientes", clientesRouter);
router.use("/clientes-tat", clientesTatRouter);
router.use("/planes", planesRouter);
router.use("/planillas", planillasRouter);
router.use("/novedades", novedadesRouter);
router.use("/config", configRouter);

export default router;
