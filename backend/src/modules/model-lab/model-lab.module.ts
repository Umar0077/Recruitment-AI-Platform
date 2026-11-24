import { Module } from "@nestjs/common";
import { ModelLabController, SuperAdminModelLabGuard } from "./model-lab.controller";
import { ModelLabService } from "./model-lab.service";
import { V5InferenceClient } from "./v5-inference.client";

@Module({
  controllers: [ModelLabController],
  providers: [V5InferenceClient, ModelLabService, SuperAdminModelLabGuard],
  exports: [ModelLabService],
})
export class ModelLabModule {}
