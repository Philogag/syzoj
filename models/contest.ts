import * as TypeORM from "typeorm";
import Model from "./common";

declare var syzoj, ErrorMessage: any;

import User from "./user";
import Problem from "./problem";
import ContestRanklist from "./contest_ranklist";
import ContestPlayer from "./contest_player";
import Group from "./group";
import GroupUser from "./group_user"

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
  @TypeORM.Column({ nullable: true, type: "enum", enum: PublicModeType, default: PublicModeType.PUBLIC })
  public_mode: PublicModeType;

  // for passwd mode
  @TypeORM.Column({ nullable: true, type: "text" })
  passwd: string;

  @TypeORM.Column({ nullable: true, type: "text" })
  allowedUser: string; 

  @TypeORM.ManyToMany(type => Group, group => group.allowedContest)
  @TypeORM.JoinTable()
  allowedGroup: Group[];

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

  async newSubmission(judge_state) {
    if (!(judge_state.submit_time >= this.start_time && judge_state.submit_time <= this.end_time)) {
      return;
    }
    let problems = await this.getProblems();
    if (!problems.includes(judge_state.problem_id)) throw new ErrorMessage('当前比赛中无此题目。');

    await syzoj.utils.lock(['Contest::newSubmission', judge_state.user_id], async () => {

      if (!await Contest.isVisitAllowed(await User.findById(judge_state.user_id), this)) {
        throw new ErrorMessage('您没有此比赛的权限。');
      }
      let player = await ContestPlayer.findOne({
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

  ///////// Permission Check /////////
  static async isViewAllowed(user, contest) {
    return contest.is_enabled || await Contest.isEditAllowed(user, contest); // not public and no permission to edit, then cannot see it. 
  }
  
  static async isVisitAllowed(user: User, contest: Contest, passwd = null) {
    if (!user) return false;
    let player = await ContestPlayer.findOne({ contest_id: contest.id, user_id: user.id });
    let player_exist = Boolean(player);
    switch (contest.public_mode) {
      
      case 'public':
        if (!player_exist) await contest.createPlayer(user.id);
        return true;
        break;
      
      case 'invite':
        console.log(contest.public_mode)
        if (await Contest.isEditAllowed(user, contest)) {
          // console.log('Allowed by Admin list.')
          return true;
        }
        if (contest.allowedUser.split('|').map(x => parseInt(x)).includes(user.id)) {
          if (!player_exist) await contest.createPlayer(user.id);
          // console.log('Allowed by user list.')
          return true;
        }
        if (!contest.allowedGroup || contest.allowedGroup.length <= 0)
          return false;
        console.log(contest.allowedGroup);
        let gids = contest.allowedGroup.map(x => x.id);
        let gusers = await GroupUser.findOne({
          uid: user.id,
          gid: TypeORM.In(gids)
        });
        console.log(gids);
        console.log(gusers);
        if (gusers) { // allowed by group
          if (!player_exist) await contest.createPlayer(user.id);
          // console.log('Allowed by group.')
          return true;
        }
        else
          return false;
        break;
        
      case 'passwd':
        if (player_exist)
          return true; // joined already
        if (passwd === contest.passwd) {
          await contest.createPlayer(user.id);
          return true;
        }
        return false;
        break;
    }
  }
  
  static async isEditAllowed(user, contest) {
    if (!user) return false;
    var permission = Boolean(contest.admins.split('|').map(x => parseInt(x)).includes(user.id) || (contest.holder_id === user.id) || user.isSuperAdmin()); // super admin can edit any thing.
    // console.log(permission)
    if (permission) {
      let player = await ContestPlayer.findOne({ contest_id: contest.id, user_id: user.id });
      let player_exist = Boolean(player);
      if (!player_exist) {
        let player_c = await ContestPlayer.create({
          contest_id: contest.id, 
          user_id: user.id,
          star: true
        })
        await player_c.save();
      }
    }
    return permission;
  }
  
  static async isCreateAllowed(user) {
    return user && user.isTeacherAdmin();
  }
}
