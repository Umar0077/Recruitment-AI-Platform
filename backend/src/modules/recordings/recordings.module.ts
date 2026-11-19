import { Body, Controller, Delete, Get, Module, Param, ParseUUIDPipe, Post, Query, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { Ctx, type RequestContext } from "../../common/http";
import { RequirePermissions } from "../../common/decorators";
import { RecordingStorage } from "../../integrations/storage/recording-storage";
import { RecordingsService } from "./recordings.service";
import { BeginRecordingDto, PartDto, CompleteRecordingDto, RecordingEventDto } from "./recordings.dto";
@Controller("recordings")
export class RecordingsController {
  constructor(private service: RecordingsService) {}
  @Get("policy") policy() { return this.service.policy(); }
  @Get() list(@Query("sessionId", ParseUUIDPipe) id: string, @Ctx() ctx: RequestContext) { return this.service.list(id, ctx.user); }
  @Post() @RequirePermissions("interviews:take") @Throttle({ default: { limit: 10, ttl: 60000 } }) begin(@Body() dto: BeginRecordingDto, @Ctx() ctx: RequestContext) { return this.service.begin(dto, ctx.user); }
  @Post(":id/parts") @RequirePermissions("interviews:take") part(@Param("id", ParseUUIDPipe) id: string, @Body() dto: PartDto, @Ctx() ctx: RequestContext) { return this.service.part(id, dto, ctx.user); }
  @Post(":id/complete") @RequirePermissions("interviews:take") complete(@Param("id", ParseUUIDPipe) id: string, @Body() dto: CompleteRecordingDto, @Ctx() ctx: RequestContext) { return this.service.complete(id, dto, ctx.user); }
  @Post(":id/events") @RequirePermissions("interviews:take") @Throttle({ default: { limit: 120, ttl: 60000 } }) event(@Param("id", ParseUUIDPipe) id: string, @Body() dto: RecordingEventDto, @Ctx() ctx: RequestContext) { return this.service.event(id, dto, ctx.user); }
  @Get(":id/playback") @RequirePermissions("interviews:review") playback(@Param("id", ParseUUIDPipe) id: string, @Ctx() ctx: RequestContext, @Res({ passthrough: true }) res: Response) { res.setHeader("Cache-Control", "no-store"); res.setHeader("Referrer-Policy", "no-referrer"); return this.service.playback(id, ctx.user); }
  @Delete(":id") remove(@Param("id", ParseUUIDPipe) id: string, @Ctx() ctx: RequestContext) { return this.service.remove(id, ctx.user); }
}
@Module({ controllers: [RecordingsController], providers: [RecordingsService, RecordingStorage] })
export class RecordingsModule {}
