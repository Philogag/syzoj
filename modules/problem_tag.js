let ProblemTagGroup = syzoj.model('problem_tag_group');
let ProblemTag = syzoj.model('problem_tag');

app.get('/admin/tags', async (req, res) => {
  try {
    if (!res.locals.user || !res.locals.user.isSuperAdmin()) throw new ErrorMessage('您没有权限进行此操作。');

    tag_groups = await ProblemTagGroup.find({ order: {id: "ASC"}, relations: ["tags"]});

    res.render('manage/global/tags', {
      tag_groups: tag_groups
    });
  } catch (e) {
    syzoj.log(e);
    res.render('error', {
      err: e
    });
  }
});

app.post('/admin/tags/update', async (req, res) => {
  try {
    if (!res.locals.user || !res.locals.user.isSuperAdmin()) throw new ErrorMessage('您没有权限进行此操作。');

    let id = parseInt(req.body.id);
    let tag = await ProblemTag.findById(id);

    console.log(req.body);

    if (req.body.do_delete === "false") {
      if (!tag) {
        tag = await ProblemTag.create();
      }
              
      req.body.name = req.body.name.trim();
      if (tag.name !== req.body.name) {
        if (await ProblemTag.findOne({ where: { name: req.body.name } })) {
          throw new ErrorMessage('标签名称已被使用。');
        }
      }

      let gid = parseInt(req.body.gid);
      console.log(gid);
      tgroup = await ProblemTagGroup.findById(gid);
      if (!tgroup) {
        throw new ErrorMessage("组不存在。");
      }

      tag.name = req.body.name;
      tag.color = req.body.tag_color;
      tag.group = tgroup;

      await tag.save();

    } else {
      if (tag) {
        await tag.destroy();
      }
    }

    res.send({success: true});
  } catch (e) {
    syzoj.log(e);
    res.render('error', {
      err: e
    });
  }
});


app.post('/admin/tags/group', async (req, res) => {
  try {
    if (!res.locals.user || !res.locals.user.isSuperAdmin()) throw new ErrorMessage('您没有权限进行此操作。');

    let id = parseInt(req.body.id);
    let tg = await ProblemTagGroup.findById(id);

    if (req.body.do_delete === "false") {
      if (!tg) {
        tg = await ProblemTagGroup.create();
      }
              
      req.body.name = req.body.name.trim();
      if (tg.name !== req.body.name) {
        if (await ProblemTagGroup.findOne({ where: { name: req.body.name } })) {
          throw new ErrorMessage('组名已被使用。');
        }
      }

      tg.name = req.body.name;
      tg.color = req.body.group_color;

      await tg.save();

    } else {
      if (tg) {
        await tg.destroy();
      }
    }

    res.send({success: true});
  } catch (e) {
    syzoj.log(e);
    res.render('error', {
      err: e
    });
  }
});
