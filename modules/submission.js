/*
 *  This file is part of SYZOJ.
 *
 *  Copyright (c) 2016 Menci <huanghaorui301@gmail.com>
 *
 *  SYZOJ is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as
 *  published by the Free Software Foundation, either version 3 of the
 *  License, or (at your option) any later version.
 *
 *  SYZOJ is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public
 *  License along with SYZOJ. If not, see <http://www.gnu.org/licenses/>.
 */

'use strict';

let JudgeState = syzoj.model('judge_state');
let User = syzoj.model('user');
let Contest = syzoj.model('contest');

app.get('/submissions', async (req, res) => {
  try {
    let user = await User.fromName(req.query.submitter || '');
    let where = {};
    if (user) where.user_id = user.id;
    if (req.query.problem_id) where.problem_id = parseInt(req.query.problem_id);
    where.type = { $ne: 1 };

    let paginate = syzoj.utils.paginate(await JudgeState.count(where), req.query.page, syzoj.config.page.judge_state);
    let judge_state = await JudgeState.query(paginate, where, [['submit_time', 'desc']]);

    await judge_state.forEachAsync(async obj => obj.loadRelationships());
    await judge_state.forEachAsync(async obj => obj.hidden = !(await obj.isAllowedSeeResultBy(res.locals.user)));
    await judge_state.forEachAsync(async obj => obj.allowedSeeCode = await obj.isAllowedSeeCodeBy(res.locals.user));

    res.render('submissions', {
      judge_state: judge_state,
      paginate: paginate,
      form: {
        submitter: req.query.submitter || '',
        problem_id: req.query.problem_id || ''
      }
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', {
      err: e
    });
  }
});

app.get('/submissions/:id/ajax', async (req, res) => {
  try {
    let judge_state = await JudgeState.fromID(req.params.id);
    if (!judge_state) throw 'No such judge state';

    await judge_state.loadRelationships();

    judge_state.hidden = !(await judge_state.isAllowedSeeResultBy(res.locals.user));
    judge_state.allowedSeeCode = await judge_state.isAllowedSeeCodeBy(res.locals.user);

    res.render('submissions_item', {
      judge: judge_state
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', {
      err: e
    });
  }
});

app.get('/submission/:id', async (req, res) => {
  try {
    let id = parseInt(req.params.id);
    let judge = await JudgeState.fromID(id);

    let contest;
    if (judge.type === 1) contest = await Contest.fromID(judge.type_info);

    await judge.loadRelationships();

    judge.codeLength = judge.code.length;
    judge.code = await syzoj.utils.highlight(judge.code, syzoj.config.languages[judge.language].highlight);
    if (judge.result.compiler_output) judge.result.compiler_output = syzoj.utils.ansiToHTML(judge.result.compiler_output);
    judge.allowedSeeResult = await judge.isAllowedSeeResultBy(res.locals.user);
    judge.allowedSeeCode = await judge.isAllowedSeeCodeBy(res.locals.user);
    judge.allowedRejudge = await judge.problem.isAllowedEditBy(res.locals.user);

    if (contest) {
      let problems_id = await contest.getProblems();
      judge.problem_id = problems_id.indexOf(judge.problem_id) + 1;
      judge.problem.title = syzoj.utils.removeTitleTag(judge.problem.title);
    }

    res.render('submission', {
      contest: contest,
      judge: judge
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', {
      err: e
    });
  }
});

app.get('/submission/:id/ajax', async (req, res) => {
  try {
    let id = parseInt(req.params.id);
    let judge = await JudgeState.fromID(id);

    let contest;
    if (judge.type === 1) contest = await Contest.fromID(judge.type_info);

    await judge.loadRelationships();

    judge.codeLength = judge.code.length;
    judge.code = await syzoj.utils.highlight(judge.code, syzoj.config.languages[judge.language].highlight);
    if (judge.result.compiler_output) judge.result.compiler_output = syzoj.utils.ansiToHTML(judge.result.compiler_output);
    judge.allowedSeeResult = await judge.isAllowedSeeResultBy(res.locals.user);
    judge.allowedSeeCode = await judge.isAllowedSeeCodeBy(res.locals.user);
    judge.allowedRejudge = await judge.problem.isAllowedEditBy(res.locals.user);

    if (contest) {
      let problems_id = await contest.getProblems();
      judge.problem_id = problems_id.indexOf(judge.problem_id) + 1;
      judge.problem.title = syzoj.utils.removeTitleTag(judge.problem.title);
    }

    res.render('submission_content', {
      contest: contest,
      judge: judge
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', {
      err: e
    });
  }
});

app.get('/submission/:id/rejudge', async (req, res) => {
  try {
    let id = parseInt(req.params.id);
    let judge = await JudgeState.fromID(id);

    if (judge.pending) throw 'Can\'t rejudge a pending submission';

    await judge.loadRelationships();

    let allowedRejudge = await judge.problem.isAllowedEditBy(res.locals.user);
    if (!allowedRejudge) throw 'Permission denied';

    await judge.rejudge();

    res.redirect(syzoj.utils.makeUrl(['submission', id]));
  } catch (e) {
    syzoj.log(e);
    res.render('error', {
      err: e
    });
  }
});