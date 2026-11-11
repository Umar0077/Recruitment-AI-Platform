import { Body, Controller, Get, HttpCode, Module, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { RequirePermissions } from "../../common/decorators";
import { PERMISSIONS } from "../../common/constants/permissions";
import { Ctx, Paged, type RequestContext } from "../../common/http";
import { CreateInterviewDto, InterviewListQueryDto, SaveAnswerDto, StartInterviewDto } from "./interviews.dto";
import { InterviewsService } from "./interviews.service";

const P = PERMISSIONS;
/** Question codes look like FE-001 / CSR-004. */
const QUESTION_CODE = /^[A-Z]{2,5}-\d{3}$/;

@ApiTags("interviews")
@ApiBearerAuth()
@Controller("interviews")
class InterviewsController {
  constructor(private readonly svc: InterviewsService) {}

  @Post()
  @RequirePermissions(P.INTERVIEWS_INVITE)
  @ApiOperation({ summary: "Issue an AI interview for an application (pins the active published question-set version)." })
  invite(@Body() dto: CreateInterviewDto, @Ctx() ctx: RequestContext) {
    return this.svc.invite(dto.applicationId, ctx);
  }

  @Get()
  @RequirePermissions(P.INTERVIEWS_READ)
  async list(@Query() q: InterviewListQueryDto, @Ctx() { user }: RequestContext) {
    const { rows, meta } = await this.svc.list(q, user);
    return new Paged(rows, meta);
  }

  @Get("me")
  @RequirePermissions(P.INTERVIEWS_TAKE)
  @ApiOperation({ summary: "The signed-in candidate's own interviews." })
  mine(@Ctx() { user }: RequestContext) {
    return this.svc.listMine(user);
  }

  /** Staff (interviews:read) or the owning candidate. Ownership is enforced in the service. */
  @Get(":id")
  detail(@Param("id", ParseUUIDPipe) id: string, @Ctx() { user }: RequestContext) {
    return this.svc.detail(id, user);
  }

  @Get(":id/progress")
  progress(@Param("id", ParseUUIDPipe) id: string, @Ctx() { user }: RequestContext) {
    return this.svc.progress(id, user);
  }

  @Post(":id/start")
  @HttpCode(200)
  @RequirePermissions(P.INTERVIEWS_TAKE)
  @ApiOperation({ summary: "Start a PENDING interview (body { consent: true } required) or continue an open one. Repeat calls are safe." })
  start(@Param("id", ParseUUIDPipe) id: string, @Body() dto: StartInterviewDto, @Ctx() ctx: RequestContext) {
    return this.svc.start(id, ctx, dto.consent === true);
  }

  @Post(":id/resume")
  @HttpCode(200)
  @RequirePermissions(P.INTERVIEWS_TAKE)
  @ApiOperation({ summary: "Resume an interrupted interview at the first unanswered question." })
  resume(@Param("id", ParseUUIDPipe) id: string, @Ctx() ctx: RequestContext) {
    return this.svc.start(id, ctx);
  }

  @Post(":id/interrupt")
  @HttpCode(200)
  @RequirePermissions(P.INTERVIEWS_TAKE)
  interrupt(@Param("id", ParseUUIDPipe) id: string, @Ctx() ctx: RequestContext) {
    return this.svc.interrupt(id, ctx);
  }

  @Put(":id/answers/:questionId")
  @RequirePermissions(P.INTERVIEWS_TAKE)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: "Save the confirmed answer for a question (questionId = question code, e.g. FE-001). Idempotent for identical text." })
  saveAnswer(@Param("id", ParseUUIDPipe) id: string, @Param("questionId") questionId: string, @Body() dto: SaveAnswerDto, @Ctx() ctx: RequestContext) {
    const code = questionId.toUpperCase();
    if (!QUESTION_CODE.test(code)) return this.svc.saveAnswer(id, "__invalid__", dto, ctx);
    return this.svc.saveAnswer(id, code, dto, ctx);
  }

  @Post(":id/submit")
  @HttpCode(200)
  @RequirePermissions(P.INTERVIEWS_TAKE)
  @ApiOperation({ summary: "Submit a fully answered interview. Repeat calls are safe and return the same result." })
  submit(@Param("id", ParseUUIDPipe) id: string, @Ctx() ctx: RequestContext) {
    return this.svc.submit(id, ctx);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  @RequirePermissions(P.INTERVIEWS_INVITE)
  cancel(@Param("id", ParseUUIDPipe) id: string, @Ctx() ctx: RequestContext) {
    return this.svc.cancel(id, ctx);
  }
}

@Module({ controllers: [InterviewsController], providers: [InterviewsService], exports: [InterviewsService] })
export class InterviewsModule {}
