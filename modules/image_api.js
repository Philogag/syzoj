const jwt = require('jsonwebtoken');
const url = require('url');
const fs = require('fs-extra');

let Image = syzoj.model("image");

app.post('/api/image/list', async (req, res) => {
  try {
    if (!res.locals.user) throw new ErrorMessage("请登录");

    // console.log(req.body);
    images = await Image.find({ manager: req.body.manager });
    if (images)
      images = images.map(x => { return { id: x.id, name: x.name, url: x.getURL() } });
    else
      images = []

    res.send({ success: true, data: images });
  } catch (e) {
    res.send({ success: false, msg: e.message });
  }
});

app.post('/api/image/upload', app.multer.fields([{ name: 'image', maxCount: 1 }]), async (req, res) => {
  try {
    if (!res.locals.user) throw new ErrorMessage("请登录");

    var file = req.files.image[0];
    var manager = req.body.manager;

    if (file.size > syzoj.config.limit.image_size) throw new ErrorMessage('图片过大, 应小于' + syzoj.utils.formatSize(syzoj.config.limit.image_size) + "。");
    let filename = file.filename + "_" + syzoj.utils.randomString(6) + "." + file.originalname.split('.').pop().toLowerCase();
    await fs.move(file.path, Image.resolvePath(filename), { overwrite: true });

    let newimage = await Image.findOne({ where: { filename: filename } });
    originalname = file.originalname.split('.').slice(0, -1).join('.');

    if (!newimage) {
      newimage = await Image.create({
        filename: filename,
        manager: manager,
        name: originalname,
      });
      await newimage.save();
    }

    res.send({ success: true })
  } catch (e) {
    // console.log(e);
    res.send({ success: false, msg: e.message });
  }
});

app.get('/api/image/delete/:id', async (req, res) => {
  try {
    if (!res.locals.user) throw new ErrorMessage("请登录");

    image = await Image.findById(parseInt(req.params.id));
    if (image) {
      await fs.unlink(image.getPath());
      await image.destroy();
    }
    res.send({ success: true })
  } catch (e) {
    res.send({ success: false, msg: e.message });
  }
})

app.post('/api/image/rename', async (req, res) => {
  try {
    if (!res.locals.user) throw new ErrorMessage("请登录");

    var id = req.body.id;
    var manager = req.body.manager;
    var newname = req.body.name;

    let image = await Image.findOne({ where: { id: id, manager: manager } });

    if (image) {
      image.name = name;
      await newimage.save();
      res.send({ success: true });
    } else {
      res.send({ success: false, msg: "Image not found." });
    }
  } catch (e) {
    res.send({ success: false, msg: e.message });
  }
});