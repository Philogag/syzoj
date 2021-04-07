let Contest = syzoj.model('contest');
let ContestRanklist = syzoj.model('contest_ranklist');
let ContestPlayer = syzoj.model('contest_player');
let Problem = syzoj.model('problem');
let JudgeState = syzoj.model('judge_state');
let User = syzoj.model('user');
let Group = syzoj.model('group');

const url = require('url');
const jwt = require('jsonwebtoken');
const util = require("util");
const { getSubmissionInfo, getRoughResult, processOverallResult } = require('../libs/submissions_process');

function isLogin(user) {
  return Boolean(user);
}

// view contest list
// Permission Level: none
app.get('/contests', async (req, res) => {
  try {
    let where;
    if (res.locals.user && res.locals.user.is_admin) where = {}
    else where = { is_enabled: true };

    let args = url.parse(req.url, true).query;
    if (typeof args !== undefined) {
      if (args.title)
        where.title = TypeORM.Like(`%${args.title}%`);
      if (args.type) {
        where.type = args.type;
      } else {
        args.type = "none";
      }
      if (args.pub) {
        where.public_mode = args.pub;
      } else {
        args.pub = "none";
      }

      if (args.mine === 'on' && res.locals.user) {
        cs = await ContestPlayer.find({ user_id: res.locals.user.id });
        cid = cs.map((c) => c.contest_id);
        where.id = TypeORM.In(cid);
      } else {
        args.mine = "";
      }
    } else {
      args = {}
    }

    let paginate = syzoj.utils.paginate(await Contest.countForPagination(where), req.query.page, syzoj.config.page.contest);
    let contests = await Contest.queryPage(paginate, where, {
      start_time: 'DESC'
    });

    await contests.forEachAsync(async x => x.subtitle = await syzoj.utils.markdown(x.subtitle));

    res.render('contests', {
      contests: contests,
      paginate: paginate,
      args: args
    })
  } catch (e) {
    syzoj.log(e);
    res.render('error', {
      err: e
    });
  }
});

// try edit or create a new contest 
// Permission Level: 
//     create: Contest.isCreateAllowed
//     edit:   Contest.isEditAllowed
app.get('/contest/:id/edit', async (req, res) => {
  try {

    let contest_id = parseInt(req.params.id);
    let contest = await Contest.findById(contest_id);
    if (!contest) {
      // if contest does not exist, only system administrators can create one
      if (!await Contest.isCreateAllowed(res.locals.user)) throw new ErrorMessage('您没有权限进行此操作。');

      contest = await Contest.create();
      contest.id = 0;
    } else {
      // if contest exists, both system administrators and contest administrators can edit it.
      if (!await Contest.isEditAllowed(res.locals.user, contest)) throw new ErrorMessage('您没有权限编辑这个比赛。');

      await contest.loadRelationships();
    }

    let problems = [], admins = [];
    if (contest.problems) problems = await contest.problems.split('|').mapAsync(async id => await Problem.findById(id));
    if (contest.admins) admins = await contest.admins.split('|').mapAsync(async id => await User.findById(id));

    if (contest.public_mode === 'invite' && contest.allowedUser)
      contest.allowedUser = await contest.allowedUser.split(',').mapAsync(async id => await User.findById(id));

    let contestlang = JSON.parse(JSON.stringify(syzoj.languages)); // Deep copy;
    if (contest.lang) {
      for (let l of contest.lang.split("|")) {
        contestlang[l].enable = true;
      };
    }

    res.render('contest_edit', {
      contest: contest,
      problems: problems,
      admins: admins,
      contestlang: contestlang
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', {
      err: e
    });
  }
});

// update or create a contest setting 
// Permission level:
//    create:  Contest.isCreateAllowed 
//    exit:    Contest.isEditAllowed
app.post('/contest/:id/edit', async (req, res) => {
  try {
    // console.log(req.body);
    let contest_id = parseInt(req.params.id);
    let contest = await Contest.findById(contest_id);
    let ranklist = null;
    if (!contest) {
      if (!await Contest.isCreateAllowed(res.locals.user)) throw new ErrorMessage('您没有权限进行此操作。');

      contest = await Contest.create();

      contest.holder_id = res.locals.user.id;

      ranklist = await ContestRanklist.create();

      // Only new contest can be set type
      if (!['noi', 'ioi', 'acm'].includes(req.body.type)) throw new ErrorMessage('无效的赛制。');
      contest.type = req.body.type;
    } else {
      if (!await Contest.isEditAllowed(res.locals.user, contest)) throw new ErrorMessage('您没有权限进行此操作。');

      await contest.loadRelationships();
      ranklist = contest.ranklist;
    }

    try {
      ranklist.ranking_params = JSON.parse(req.body.ranking_params);
    } catch (e) {
      ranklist.ranking_params = {};
    }
    await ranklist.save();
    contest.ranklist_id = ranklist.id;

    if (!req.body.title.trim()) throw new ErrorMessage('比赛名不能为空。');
    contest.title = req.body.title;
    contest.subtitle = req.body.subtitle;

    for (var key of ['problems', 'allowed_group']) {
      if (!req.body[key]) req.body[key] = []
      if (!Array.isArray(req.body[key])) req.body[key] = req.body[key].split(',');
    }

    if (!Array.isArray(req.body.admins)) req.body.admins = [req.body.admins];
    if (!Array.isArray(req.body.contestlang)) req.body.contestlang = [req.body.contestlang];

    contest.problems = req.body.problems.join('|');
    contest.admins = req.body.admins.map((str) => { if (str) return str.split('.')[0]; }).join('|');
    contest.lang = req.body.contestlang.join('|');
    contest.information = req.body.information;
    contest.start_time = syzoj.utils.parseDate(req.body.start_time);
    contest.end_time = syzoj.utils.parseDate(req.body.end_time);
    contest.public_mode = req.body.public_mode;
    contest.hide_statistics = req.body.hide_statistics === 'on';

    if (contest.public_mode === 'invite') {
      contest.allowedUser = req.body.allowed_user;
      contest.allowedGroup = await Group.find({ id: TypeORM.In(req.body.allowed_group.map(x => { return parseInt(x) })) });
    } else if (contest.public_mode === 'passwd') {
      contest.passwd = req.body.passwd;
    }

    contest.is_enabled = req.body.is_enable === 'on';

    // console.log(contest);

    await contest.save();

    res.redirect(syzoj.utils.makeUrl(['contest', contest.id]));
  } catch (e) {
    syzoj.log(e);
    res.render('error', {
      err: e
    });
  }
});

// get login view of a contest witch needs password
// Permission level:
//    Contest.isViewAllowed
app.get('/contest/:id/login', async (req, res) => {
  try {
    const curUser = res.locals.user;
    let contest_id = parseInt(req.params.id);

    let contest = await Contest.findById(contest_id);
    if (!contest) throw new ErrorMessage('无此比赛。');

    // if contest is non-public, both system administrators and contest administrators can see it.
    if (! await Contest.isViewAllowed(curUser, contest)) throw new ErrorMessage('比赛未公开，请耐心等待 (´∀ `)');

    contest.running = contest.isRunning();
    contest.ended = contest.isEnded();
    contest.subtitle = await syzoj.utils.markdown(contest.subtitle);
    contest.information = await syzoj.utils.markdown(contest.information);

    if (await Contest.isVisitAllowed(curUser, contest)) { // has permission already
      res.redirect(syzoj.utils.makeUrl(['contest', contest.id]));
    }

    res.render('contest_login', {
      contest: contest,
      isSupervisior: await Contest.isEditAllowed(res.locals.user, contest),
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', {
      err: e
    });
  }
});

// try login a contest witch needs password
// Permission level:
//    Contest.isViewAllowed && Contest.isVisitAllowed with password
app.post('/contest/:id/login', async (req, res) => {
  try {
    const curUser = res.locals.user;
    if (!curUser) {
      res.redirect(syzoj.utils.makeUrl(['login']));
    }
    let contest_id = parseInt(req.params.id);

    let contest = await Contest.findById(contest_id);
    if (!contest) throw new ErrorMessage('无此比赛。');

    // if contest is non-public, both system administrators and contest administrators can see it.
    if (!await Contest.isViewAllowed(curUser, contest)) throw new ErrorMessage('比赛未公开，请耐心等待 (´∀ `)');

    let permission = await Contest.isVisitAllowed(curUser, contest, req.body.passwd);
    if (permission) {
      res.redirect(syzoj.utils.makeUrl(["contest", contest.id]))
    }
    else {
      res.render('error', {
        err: new ErrorMessage('密码错误。')
      });
    }
  } catch (e) {
    syzoj.log(e);
    res.render('error', {
      err: e
    });
  }
});

// visit a contest
// Permission level:
//    isLogin
//    Contest.isViewAllowed
//    Contest.isVisitAllowed
app.get('/contest/:id', async (req, res) => {
  try {
    const curUser = res.locals.user;
    let contest_id = parseInt(req.params.id);

    let contest = await Contest.findById(contest_id);
    if (!contest) throw new ErrorMessage('无此比赛。');

    if (!isLogin(curUser)) {
      res.redirect(syzoj.utils.makeUrl(['contest', contest.id, 'login']));
    }
    // if contest is non-public, both system administrators and contest administrators can see it.
    if (!await Contest.isViewAllowed(curUser, contest)) throw new ErrorMessage('比赛未公开，请耐心等待 (´∀ `)');

    contest.running = contest.isRunning();
    contest.ended = contest.isEnded();
    contest.subtitle = await syzoj.utils.markdown(contest.subtitle);
    contest.information = await syzoj.utils.markdown(contest.information);

    let canVisit = await Contest.isVisitAllowed(curUser, contest);
    let canEdit = await Contest.isEditAllowed(curUser, contest);
    if (!canVisit && !canEdit) {
      res.redirect(syzoj.utils.makeUrl(['contest', contest.id, 'login']));
    }

    let player = await ContestPlayer.findOne({
      contest_id: contest.id,
      user_id: res.locals.user.id
    });

    let contestlang = JSON.parse(JSON.stringify(syzoj.languages)); // Deep copy;
    if (contest.lang) {
      for (let l of contest.lang.split("|")) {
        contestlang[l].enable = true;
      }
    }

    let problems_id = await contest.getProblems();
    let problems = await problems_id.mapAsync(async id => await Problem.findById(id));

    problems = problems.map(x => ({ problem: x, status: null, judge_id: null, statistics: null }));
    if (player) {
      for (let problem of problems) {
        if (contest.type === 'noi') {
          if (player.score_details[problem.problem.id]) {
            let judge_state = await JudgeState.findById(player.score_details[problem.problem.id].judge_id);
            problem.status = judge_state.status;
            if (!contest.ended && !await problem.problem.isAllowedEditBy(res.locals.user) && !['Compile Error', 'Waiting', 'Compiling'].includes(problem.status)) {
              problem.status = 'Submitted';
            }
            problem.judge_id = player.score_details[problem.problem.id].judge_id;
          }
        } else if (contest.type === 'ioi') {
          if (player.score_details[problem.problem.id]) {
            let judge_state = await JudgeState.findById(player.score_details[problem.problem.id].judge_id);
            problem.status = judge_state.status;
            problem.judge_id = player.score_details[problem.problem.id].judge_id;
            await contest.loadRelationships();
            let multiplier = contest.ranklist.ranking_params[problem.problem.id] || 1.0;
            problem.feedback = (judge_state.score * multiplier).toString() + ' / ' + (100 * multiplier).toString();
          }
        } else if (contest.type === 'acm') {
          if (player.score_details[problem.problem.id]) {
            problem.status = {
              accepted: player.score_details[problem.problem.id].accepted,
              unacceptedCount: player.score_details[problem.problem.id].unacceptedCount
            };
            problem.judge_id = player.score_details[problem.problem.id].judge_id;
          } else {
            problem.status = null;
          }
        }
      }
    }

    let hasStatistics = false;
    if ((!contest.hide_statistics) || (contest.ended) || (isSupervisior)) {
      hasStatistics = true;

      await contest.loadRelationships();
      let players = await contest.ranklist.getPlayers();
      for (let problem of problems) {
        problem.statistics = { attempt: 0, accepted: 0 };

        if (contest.type === 'ioi' || contest.type === 'noi') {
          problem.statistics.partially = 0;
        }

        for (let player of players) {
          if (player.score_details[problem.problem.id]) {
            problem.statistics.attempt++;
            if ((contest.type === 'acm' && player.score_details[problem.problem.id].accepted) || ((contest.type === 'noi' || contest.type === 'ioi') && player.score_details[problem.problem.id].score === 100)) {
              problem.statistics.accepted++;
            }

            if ((contest.type === 'noi' || contest.type === 'ioi') && player.score_details[problem.problem.id].score > 0) {
              problem.statistics.partially++;
            }
          }
        }
      }
    }

    res.render('contest', {
      contest: contest,
      problems: problems,
      hasStatistics: hasStatistics,
      isSupervisior: await Contest.isEditAllowed(curUser, contest),
      contestlang: contestlang
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', {
      err: e
    });
  }
});

app.get('/contest/:id/ranklist', async (req, res) => {
  try {
    let contest_id = parseInt(req.params.id);
    let contest = await Contest.findById(contest_id);
    const curUser = res.locals.user;

    const canEdit = await Contest.isEditAllowed(curUser, contest);

    if (!contest) throw new ErrorMessage('无此比赛。');
    // if contest is non-public, both system administrators and contest administrators can see it.
    if (!await Contest.isViewAllowed(curUser, contest)) throw new ErrorMessage('比赛未公开，请耐心等待 (´∀ `)');

    if (!contest.allowedSeeingResult() &&
      !contest.allowedSeeingOthers() &&
      !contest.isEnded() &&
      !canEdit)
      throw new ErrorMessage('您没有权限进行此操作。');

    await contest.loadRelationships();

    let players_id = [];
    for (let i = 1; i <= contest.ranklist.ranklist.player_num; i++) players_id.push(contest.ranklist.ranklist[i]);

    let ranklist = await players_id.mapAsync(async player_id => {
      let player = await ContestPlayer.findById(player_id);

      if (contest.type === 'noi' || contest.type === 'ioi') {
        player.score = 0;
      }

      for (let i in player.score_details) {
        player.score_details[i].judge_state = await JudgeState.findById(player.score_details[i].judge_id);

        /*** XXX: Clumsy duplication, see ContestRanklist::updatePlayer() ***/
        if (contest.type === 'noi' || contest.type === 'ioi') {
          let multiplier = (contest.ranklist.ranking_params || {})[i] || 1.0; // 比赛题目积分倍率
          player.score_details[i].weighted_score = player.score_details[i].score == null ? null : Math.round(player.score_details[i].score * multiplier);
          player.score += player.score_details[i].weighted_score;
        }
      }

      let user = await User.findById(player.user_id);

      return {
        user: user,
        player: player
      };
    });

    let problems_id = await contest.getProblems();
    let problems = await problems_id.mapAsync(async id => await Problem.findById(id));

    res.render('contest_ranklist', {
      contest: contest,
      ranklist: ranklist,
      problems: problems,
      isSupervisior: canEdit
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', {
      err: e
    });
  }
});

function getDisplayConfig(contest) {
  return {
    showScore: contest.allowedSeeingScore(),
    showUsage: false,
    showCode: false,
    showResult: contest.allowedSeeingResult(),
    showOthers: contest.allowedSeeingOthers(),
    showDetailResult: contest.allowedSeeingTestcase(),
    showTestdata: false,
    inContest: true,
    showRejudge: false
  };
}

app.get('/contest/:id/submissions', async (req, res) => {
  try {
    let contest_id = parseInt(req.params.id);
    let contest = await Contest.findById(contest_id);
    // if contest is non-public, both system administrators and contest administrators can see it.
    if (!await Contest.isViewAllowed(res.locals.user, contest)) throw new ErrorMessage('比赛未公开，请耐心等待 (´∀ `)');

    if (contest.isEnded()) {
      res.redirect(syzoj.utils.makeUrl(['submissions'], { contest: contest_id }));
      return;
    }

    const displayConfig = getDisplayConfig(contest);
    let problems_id = await contest.getProblems();
    const curUser = res.locals.user;

    let user = req.query.submitter && await User.fromName(req.query.submitter);
    const isSupervisior = await Contest.isEditAllowed(curUser, contest);

    let query = JudgeState.createQueryBuilder();

    let isFiltered = false;
    if (displayConfig.showOthers) {
      if (user) {
        query.andWhere('user_id = :user_id', { user_id: user.id });
        isFiltered = true;
      }
    } else {
      if (curUser == null || // Not logined
        (user && user.id !== curUser.id)) { // Not querying himself
        throw new ErrorMessage("您没有权限执行此操作。");
      }
      query.andWhere('user_id = :user_id', { user_id: curUser.id });
      isFiltered = true;
    }

    if (displayConfig.showScore) {
      let minScore = parseInt(req.body.min_score);
      if (!isNaN(minScore)) query.andWhere('score >= :minScore', { minScore });
      let maxScore = parseInt(req.body.max_score);
      if (!isNaN(maxScore)) query.andWhere('score <= :maxScore', { maxScore });

      if (!isNaN(minScore) || !isNaN(maxScore)) isFiltered = true;
    }

    if (req.query.language) {
      if (req.body.language === 'submit-answer') {
        query.andWhere(new TypeORM.Brackets(qb => {
          qb.orWhere('language = :language', { language: '' })
            .orWhere('language IS NULL');
        }));
      } else if (req.body.language === 'non-submit-answer') {
        query.andWhere('language != :language', { language: '' })
          .andWhere('language IS NOT NULL');
      } else {
        query.andWhere('language = :language', { language: req.body.language })
      }
      isFiltered = true;
    }

    if (displayConfig.showResult) {
      if (req.query.status) {
        query.andWhere('status = :status', { status: req.query.status });
        isFiltered = true;
      }
    }

    if (req.query.problem_id) {
      problem_id = problems_id[parseInt(req.query.problem_id) - 1] || 0;
      query.andWhere('problem_id = :problem_id', { problem_id })
      isFiltered = true;
    }

    query.andWhere('type = 1')
      .andWhere('type_info = :contest_id', { contest_id });

    let judge_state, paginate;

    if (syzoj.config.submissions_page_fast_pagination) {
      const queryResult = await JudgeState.queryPageFast(query, syzoj.utils.paginateFast(
        req.query.currPageTop, req.query.currPageBottom, syzoj.config.page.judge_state
      ), -1, parseInt(req.query.page));

      judge_state = queryResult.data;
      paginate = queryResult.meta;
    } else {
      paginate = syzoj.utils.paginate(
        await JudgeState.countQuery(query),
        req.query.page,
        syzoj.config.page.judge_state
      );
      judge_state = await JudgeState.queryPage(paginate, query, { id: "DESC" }, true);
    }

    await judge_state.forEachAsync(async obj => {
      await obj.loadRelationships();
      obj.problem_id = problems_id.indexOf(obj.problem_id) + 1;
      obj.problem.title = syzoj.utils.removeTitleTag(obj.problem.title);
    });

    const pushType = displayConfig.showResult ? 'rough' : 'compile';
    res.render('submissions', {
      contest: contest,
      items: judge_state.map(x => ({
        info: getSubmissionInfo(x, displayConfig),
        token: (getRoughResult(x, displayConfig) == null && x.task_id != null) ? jwt.sign({
          taskId: x.task_id,
          type: pushType,
          displayConfig: displayConfig
        }, syzoj.config.session_secret) : null,
        result: getRoughResult(x, displayConfig),
        running: false,
      })),
      paginate: paginate,
      form: req.query,
      displayConfig: displayConfig,
      pushType: pushType,
      isFiltered: isFiltered,
      fast_pagination: syzoj.config.submissions_page_fast_pagination,
      isSupervisior: isSupervisior
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', {
      err: e
    });
  }
});


app.get('/contest/submission/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const judge = await JudgeState.findById(id);
    if (!judge) throw new ErrorMessage("提交记录 ID 不正确。");
    const curUser = res.locals.user;

    if (judge.type !== 1) {
      return res.redirect(syzoj.utils.makeUrl(['submission', id]));
    }

    const contest = await Contest.findById(judge.type_info);
    contest.ended = contest.isEnded();

    if (((!curUser) || judge.user_id !== curUser.id) && !await contest.isSupervisior(curUser)) throw new ErrorMessage("您没有权限执行此操作。");

    const displayConfig = getDisplayConfig(contest);
    displayConfig.showCode = true;

    await judge.loadRelationships();
    const problems_id = await contest.getProblems();
    judge.problem_id = problems_id.indexOf(judge.problem_id) + 1;
    judge.problem.title = syzoj.utils.removeTitleTag(judge.problem.title);

    if (judge.problem.type !== 'submit-answer') {
      judge.codeLength = Buffer.from(judge.code).length;
      judge.code = await syzoj.utils.highlight(judge.code, syzoj.languages[judge.language].highlight);
    }

    res.render('submission', {
      info: getSubmissionInfo(judge, displayConfig),
      roughResult: getRoughResult(judge, displayConfig),
      code: (displayConfig.showCode && judge.problem.type !== 'submit-answer' && res.locals.user && (res.locals.user.id === judge.user_id || res.locals.user.isTeacherAdmin())) ? judge.code.toString("utf8") : '',
      formattedCode: judge.formattedCode ? judge.formattedCode.toString("utf8") : null,
      preferFormattedCode: res.locals.user ? res.locals.user.prefer_formatted_code : false,
      detailResult: processOverallResult(judge.result, displayConfig),
      socketToken: (displayConfig.showDetailResult && judge.pending && judge.task_id != null) ? jwt.sign({
        taskId: judge.task_id,
        displayConfig: displayConfig,
        type: 'detail'
      }, syzoj.config.session_secret) : null,
      displayConfig: displayConfig,
      displayDetailResult: judge.problem.is_data_public || res.locals.user && contest.isSupervisior(curUser),
      contest: contest,
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', {
      err: e
    });
  }
});

app.get('/contest/:id/problem/:pid', async (req, res) => {
  try {
    let contest_id = parseInt(req.params.id);
    let contest = await Contest.findById(contest_id);
    if (!contest) throw new ErrorMessage('无此比赛。');
    const curUser = res.locals.user;
    if (!await Contest.isViewAllowed(curUser, contest)) throw new ErrorMessage('比赛未公开，请耐心等待 (´∀ `)');

    const isSupervisior = await Contest.isEditAllowed(curUser, contest);
    let permission = await Contest.isVisitAllowed(curUser, contest);
    if (!permission && !isSupervisior) {
      res.redirect(syzoj.utils.makeUrl(['contest', contest.id, 'login']));
    } else if (!permission && isSupervisior) {
      await contest.createPlayer(curUser.id);
    }

    let problems_id = await contest.getProblems();

    let pid = parseInt(req.params.pid);
    if (!pid || pid < 1 || pid > problems_id.length) throw new ErrorMessage('无此题目。');

    let problem_id = problems_id[pid - 1];
    let problem = await Problem.findById(problem_id);
    await problem.loadRelationships();

    contest.ended = contest.isEnded();
    if (!await isSupervisior && !(contest.isRunning() || contest.isEnded())) {
      if (await problem.isAllowedUseBy(res.locals.user)) {
        return res.redirect(syzoj.utils.makeUrl(['problem', problem_id]));
      }
      throw new ErrorMessage('比赛尚未开始。');
    }

    problem.specialJudge = await problem.hasSpecialJudge();

    await syzoj.utils.markdown(problem, ['description', 'input_format', 'output_format', 'limit_and_hint']);

    let state = await problem.getJudgeState(res.locals.user, false);
    let testcases = await syzoj.utils.parseTestdata(problem.getTestdataPath(), problem.type === 'submit-answer');

    await problem.loadRelationships();

    try {
      examples = JSON.parse(problem.example);
    } catch (SyntaxError) {
      examples = [];
    }

    res.render('problem', {
      pid: pid,
      contest: contest,
      problem: problem,
      examples: examples,
      state: state,
      lastLanguage: res.locals.user ? await res.locals.user.getLastSubmitLanguage() : null,
      testcases: testcases,
      isSupervisior: isSupervisior,
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', {
      err: e
    });
  }
});

app.get('/contest/:id/:pid/download/additional_file', async (req, res) => {
  try {
    let id = parseInt(req.params.id);
    let contest = await Contest.findById(id);
    if (!contest) throw new ErrorMessage('无此比赛。');

    let problems_id = await contest.getProblems();

    let pid = parseInt(req.params.pid);
    if (!pid || pid < 1 || pid > problems_id.length) throw new ErrorMessage('无此题目。');

    let problem_id = problems_id[pid - 1];
    let problem = await Problem.findById(problem_id);

    contest.ended = contest.isEnded();
    if (!(contest.isRunning() || contest.isEnded())) {
      if (await problem.isAllowedUseBy(res.locals.user)) {
        return res.redirect(syzoj.utils.makeUrl(['problem', problem_id, 'download', 'additional_file']));
      }
      throw new ErrorMessage('比赛尚未开始。');
    }

    const isSupervisior = await contest.isSupervisior(curUser);
    let permission = await contest.allowUser(curUser.id);
    if (!permission && !isSupervisior) {
      res.redirect(syzoj.utils.makeUrl(['contest', contest.id, 'login']));
    } else if (!permission && isSupervisior) {
      await contest.createPlayer(curUser.id);
    }

    await problem.loadRelationships();

    if (!problem.additional_file) throw new ErrorMessage('无附加文件。');

    res.download(problem.additional_file.getPath(), `additional_file_${id}_${pid}.zip`);
  } catch (e) {
    syzoj.log(e);
    res.status(404);
    res.render('error', {
      err: e
    });
  }
});

const fs = require('fs');

app.get('/contest/:id/export_rank', async (req, res) => {
  try {
    let id = parseInt(req.params.id);
    let contest = await Contest.findById(id);
    if (!contest) throw new ErrorMessage('无此比赛。');

    if (!(contest.isRunning() || contest.isEnded())) {
      throw new ErrorMessage('比赛尚未结束。');
    }
    const curUser = res.locals.user;
    if (!Contest.isEditAllowed(curUser, contest)) throw new ErrorMessage('您没有权限执行此操作。');

    let problems_id = await contest.getProblems();

    ranks = await ContestPlayer.find({ contest_id: contest.id });

    filename = contest.id + "_" + syzoj.utils.randomString(16) + ".csv";
    syzoj.utils.mkdirsSync("/opt/syzoj/export");

    let remaped_rank = null;
    var rows, row_head, lastItem, rank = 1;
    switch (contest.type) {
      case 'acm':
        remaped_rank = await ranks.mapAsync(async (x) => {// 计算罚时
          var total_ac = 0;
          var total_time = 0;
          var total_unAC = 0;
          var detial = {}
          let score_details = x.score_details;
          for (var pid in score_details) {
            if (score_details[pid].accepted) {
              total_ac++;
              detial[pid] = {
                unacceptedCount: score_details[pid].unacceptedCount,
                time: score_details[pid].unacceptedCount * 20 * 60 + score_details[pid].acceptedTime - contest.start_time
              }
              total_time += detial[pid].time;
              total_unAC += detial[pid].unacceptedCount;
            }
          }
          user = await User.findById(x.user_id);
          return {
            username: user.username,
            // displayName: '',
            star: x.star,
            totalAC: total_ac,
            totalUnAC: total_unAC,
            totalTime: total_time,
            detial: detial
          }
        })
        remaped_rank = remaped_rank.map((x) => { // 填充空题
          for (let pid of problems_id)
            if (!x.detial.hasOwnProperty(String(pid)))
              x.detial[String(pid)] = { unacceptedCount: "", time: "" }
          return x;
        })
        remaped_rank.sort((a, b) => { // 排序
          if (a.totalAC !== b.totalAC) {
            return b.totalAC - a.totalAC;
          } else {
            return a.totalTime - b.totalTime;
          }
        });
        for (let item of remaped_rank) { // 排名
          if (!item.star) {
            if (item.totalAC === 0 && item.totalUnAC === 0) {
              item.rank = '';
              continue;
            }
            if (rank === 1 || item.totalAC !== lastItem.totalAC || item.totalTime !== lastItem.totalTime)
              item.rank = rank;
            else
              item.rank = lastItem.rank;
            lastItem = item; rank++;
          } else {
            item.rank = "*";
          }
        }
        row_head = ["rank", "username", "AC", "Time", problems_id.map(x => { return [x + ".AC", x + ".Time"] }).join(",")].join(",")
        rows = remaped_rank.map((x) => { // 转csv Row
          prow = ""
          for (var k in x.detial) { prow += [x.detial[k].unacceptedCount, syzoj.utils.formatTime(x.detial[k].time)].join(",") + "," }
          return [x.rank, x.username, x.totalAC, syzoj.utils.formatTime(x.totalTime), prow].join(",")
        })
        break;
      case 'noi':
        remaped_rank = await ranks.mapAsync(async (x) => {
          var total_score = 0;
          var total_time = 0;
          for (let pid in x.score_details) {
            status = await JudgeState.findById(x.score_details[pid].judge_id);
            x.score_details[pid].time = status.submit_time - contest.start_time;
            total_score += parseInt(x.score_details[pid].score); // 需要计算倍率（TODO）
            total_time += x.score_details[pid].time;
          }
          user = await User.findById(x.user_id);
          return {
            username: user.username,
            star: x.star,
            totalScore: total_score,
            totalTime: total_time,
            detial: x.score_details
          };
        })
        remaped_rank = remaped_rank.map((x) => { // 填充空题
          for (let pid of problems_id)
            if (!x.detial.hasOwnProperty(String(pid)))
              x.detial[String(pid)] = { score: "0", time: 0 }
          return x;
        })
        remaped_rank.sort((a, b) => { // 排序
          if (a.totalScore !== b.totalScore) {
            return b.totalScore - a.totalScore;
          } else {
            return a.totalTime - b.totalTime;
          }
        });
        for (let item of remaped_rank) { // 排名
          if (!item.star) {
            if (item.totalAC === 0 && item.totalUnAC === 0) {
              item.rank = '';
              continue;
            }
            if (rank === 1 || item.totalAC !== lastItem.totalAC || item.totalTime !== lastItem.totalTime)
              item.rank = rank;
            else
              item.rank = lastItem.rank;
            lastItem = item; rank++;
          } else {
            item.rank = "*";
          }
        }
        row_head = ["rank", "username", "TotalScore", "TotalTime", problems_id.map(x => { return [x + ".Score", x + ".Time"] }).join(",")].join(",")
        rows = remaped_rank.map((x) => { // 转csv Row
          prow = ""
          for (var k in x.detial) { prow += [x.detial[k].score, syzoj.utils.formatTime(x.detial[k].time)].join(",") + "," }
          return [x.rank, x.username, x.totalScore, syzoj.utils.formatTime(x.totalTime), prow].join(",");
        });
        break;
      case 'ioi':
        remaped_rank = await ranks.mapAsync(async (x) => {
          var total_time = 0;
          for (let pid in x.score_details) {
            x.score_details[pid].time -= contest.start_time;
            total_time += x.score_details[pid].time;
          }
          user = await User.findById(x.user_id);
          return {
            username: user.username,
            star: x.star,
            totalScore: x.score,
            totalTime: total_time,
            detial: x.score_details
          };
        })
        remaped_rank = remaped_rank.map((x) => { // 填充空题
          for (let pid of problems_id)
            if (!x.detial.hasOwnProperty(String(pid)))
              x.detial[String(pid)] = { score: "0", time: 0 }
          return x;
        })
        remaped_rank.sort((a, b) => { // 排序
          if (a.totalScore !== b.totalScore) {
            return b.totalScore - a.totalScore;
          } else {
            return a.totalTime - b.totalTime;
          }
        });
        for (let item of remaped_rank) { // 排名
          if (!item.star) {
            if (item.totalAC === 0 && item.totalUnAC === 0) {
              item.rank = '';
              continue;
            }
            if (rank === 1 || item.totalAC !== lastItem.totalAC || item.totalTime !== lastItem.totalTime)
              item.rank = rank;
            else
              item.rank = lastItem.rank;
            lastItem = item; rank++;
          } else {
            item.rank = "*";
          }
        }
        row_head = ["rank", "username", "TotalScore", "TotalTime", problems_id.map(x => { return [x + ".Score", x + ".Time"] }).join(",")].join(",")
        rows = remaped_rank.map((x) => { // 转csv Row
          prow = ""
          for (var k in x.detial) { prow += [x.detial[k].score, syzoj.utils.formatTime(x.detial[k].time)].join(",") + "," }
          return [x.rank, x.username, x.totalScore, syzoj.utils.formatTime(x.totalTime), prow].join(",");
        });
        break;
    }

    fs.writeFileSync('/opt/syzoj/export/' + filename, row_head + "\n" + rows.join("\n"), { flag: 'w+' });
    res.download('/opt/syzoj/export/' + filename, contest.title + "_" + syzoj.utils.getCurrentDate() + ".csv", function (err) {
      if (err) {
        console.log(err);
      } else {
        console.log("Export rank of \"" + contest.title + "\" successfully.");
      }
      fs.unlinkSync("/opt/syzoj/export/" + filename);
    });
  } catch (e) {
    syzoj.log(e);
    res.status(404);
    res.render('error', {
      err: e
    });
  }
})


app.get('/contest/:id/export_submissions', async (req, res) => {
  try {
    let id = parseInt(req.params.id);
    let contest = await Contest.findById(id);
    if (!contest) throw new ErrorMessage('无此比赛。');

    if (!(contest.isRunning() || contest.isEnded())) {
      throw new ErrorMessage('比赛尚未结束。');
    }
    const curUser = res.locals.user;
    if (!Contest.isEditAllowed(curUser, contest)) throw new ErrorMessage('您没有权限执行此操作。');

    let problems_id = await contest.getProblems();
    pathname = "/opt/syzoj/export/contest_" + contest.id + "_" + syzoj.utils.randomString(16);
    syzoj.utils.mkdirsSync(pathname);

    console.log(pathname);

    players = await ContestPlayer.find({ contest_id: contest.id });

    objs = []
    i = 1
    for (var pid of problems_id) {
      objs.push({
        path: '' + (i++) + "-p" + pid,
        id: pid
      })
    }

    await Promise.all(objs.map(async (p) => {
      var ppath = pathname + "/" + (p.path);
      await syzoj.utils.mkdirsSync(ppath);
      return Promise.all(players.map(async (player) => {
        if (player.score_details.hasOwnProperty(p.id)) {
          var submit_id = player.score_details[p.id]['judge_id'];
          var player_id = player.user_id;

          var submition = await JudgeState.findById(submit_id);
          var puser = await User.findById(player_id);
          var filename = puser.id + "_" + puser.getRealname() + "_" + submit_id + "." + syzoj.config.languages_export_extention[submition.language];

          fs.writeFileSync(ppath + '/' + filename, submition.code, { flag: 'w+' });
          // console.log(p.id + ": " + filename + ' done.');
        }
      })).then(() => {
        // console.log("Problem-" + p.id + " export finished.");
      });
    })).then(() => {
      console.log("Export code files finished.");
    }).then(async () => {
      let execAsync = util.promisify(require('child_process').exec);
      await execAsync('cd ' + pathname + ' && ' + __dirname + '/../bin/zip -m -q -r ' + pathname + '.zip ./*');
    }).then(() => {
      console.log("Zip done.");
    });

    res.download(pathname + ".zip", contest.title + "_" + 'code_' + syzoj.utils.getCurrentDate() + ".zip", function (err) {
      if (err) {
        console.log(err);
      } else {
        console.log("Export rank of \"" + contest.title + "\" successfully.");
      }
      fs.unlinkSync(pathname + '.zip');
      fs.rmdirSync(pathname);
    });

  } catch (e) {
    syzoj.log(e);
    res.status(404);
    res.render('error', {
      err: e
    });
  }
});