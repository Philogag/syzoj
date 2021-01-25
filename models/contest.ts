import * as TypeORM from "typeorm";
import Model from "./common";

declare var syzoj, ErrorMessage: any;

import User from "./user";
import Problem from "./problem";
import ContestRanklist from "./contest_ranklist";
import ContestPlayer from "./contest_player";

enum ContestType {
  NOI = "noi",
  IOI = "ioi",
  ICPC = "acm"
}

enum PublicModeType{
  PUBLIC = 'public',
  INVITE = 'invite',
  PASSWD = 'passwd'
}

@TypeORM.Entity()
export default class Contest extends Model {
  static cache = true;

  @TypeORM.PrimaryGeneratedColumn()
  id: number;

  @TypeORM.Column({ nullable: true, type: "varchar", length: 80 })
  title: string;

  @TypeORM.Column({ nullable: true, type: "text" })
  subtitle: string;

  @TypeORM.Column({ nullable: true, type: "integer" })
  start_time: number;

  @TypeORM.Column({ nullable: true, type: "integer" })
  end_time: number;

  @TypeORM.Index()
  @TypeORM.Column({ nullable: true, type: "integer" })
  holder_id: number;

  // type: noi, ioi, acm
  @TypeORM.Column({ nullable: true, type: "enum", enum: ContestType })
  type: ContestType;

  @TypeORM.Column({ nullable: true, type: "text" })
  information: string;

  @TypeORM.Column({ nullable: true, type: "text" })
  problems: string;

  @TypeORM.Column({ nullable: true, type: "text" })
  admins: string;

  @TypeORM.Index()
  @TypeORM.Column({ nullable: true, type: "integer" })
  ranklist_id: number;

  // mode of public 
  @TypeORM.Column({ nullable: true, type: "enum", enum: PublicModeType })
  public_mode: PublicModeType;

  // for passwd mode
  @TypeORM.Column({ nullable: true, type: "text" })
  passwd: string;

  @TypeORM.Column({ nullable: true, type: "text" })
  lang: string;

  @TypeORM.Column({ nullable: true, type: "boolean" })
  is_enabled: boolean;

  @TypeORM.Column({ nullable: true, type: "boolean" })
  hide_statistics: boolean;

  holder?: User;
  ranklist?: ContestRanklist;

  async loadRelationships() {
    this.holder = await User.findById(this.holder_id);
    this.ranklist = await ContestRanklist.findById(this.ranklist_id);
  }

  async isSupervisior(user) {
    return user && (user.is_admin || this.holder_id === user.id || this.admins.split('|').includes(user.id.toString()));
  }

  allowedSeeingOthers() {
    if (this.type === 'acm') return true;
    else return false;
  }

  allowedSeeingScore() { // If not, then the user can only see status
    if (this.type === 'ioi') return true;
    else return false;
  }

  allowedSeeingResult() { // If not, then the user can only see compile progress
    if (this.type === 'ioi' || this.type === 'acm') return true;
    else return false;
  }

  allowedSeeingTestcase() {
    if (this.type === 'ioi') return true;
    return false;
  }

  async getProblems() {
    if (!this.problems) return [];
    return this.problems.split('|').map(x => parseInt(x));
  }

  async setProblemsNoCheck(problemIDs) {
    this.problems = problemIDs.join('|');
  }

  async setProblems(s) {
    let a = [];
    await s.split('|').forEachAsync(async x => {
      let problem = await Problem.findById(x);
      if (!problem) return;
      a.push(x);
    });
    this.problems = a.join('|');
  }

  async createPlayer(uid) {
    let player = ContestPlayer.create({
      contest_id: this.id,
      user_id: uid
    });
    await player.save();
    return player;
  }

  async allowUser(uid, passwd = null) {
    let player = await ContestPlayer.findInContest({
      contest_id: this.id,
      user_id: uid,
    });
    console.log(player);
    switch (this.public_mode) {
      case PublicModeType.PUBLIC:
        if (!player) {
          await this.createPlayer(uid);
          return true;
        }
        return true;
      case PublicModeType.INVITE:
        return typeof player !== undefined && player;
      case PublicModeType.PASSWD:
        if (!player && passwd !== this.passwd) {
          return false;
        } else if (!player) {
          await this.createPlayer(uid);
        }
        return true;
    }
  }

  async newSubmission(judge_state) {
    if (!(judge_state.submit_time >= this.start_time && judge_state.submit_time <= this.end_time)) {
      return;
    }
    let problems = await this.getProblems();
    if (!problems.includes(judge_state.problem_id)) throw new ErrorMessage('当前比赛中无此题目。');

    await syzoj.utils.lock(['Contest::newSubmission', judge_state.user_id], async () => {

      if (!await this.allowUser(judge_state.user_id)) {
        throw new ErrorMessage('您没有此比赛的权限。');
      }
      let player = await ContestPlayer.findInContest({
        contest_id: this.id,
        user_id: judge_state.user_id,
      });

      await player.updateScore(judge_state);
      await player.save();

      await this.loadRelationships();
      await this.ranklist.updatePlayer(this, player);
      await this.ranklist.save();
    });
  }

  isRunning(now?) {
    if (!now) now = syzoj.utils.getCurrentDate();
    return now >= this.start_time && now < this.end_time;
  }

  isEnded(now?) {
    if (!now) now = syzoj.utils.getCurrentDate();
    return now >= this.end_time;
  }
}
