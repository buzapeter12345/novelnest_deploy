require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const mongoose = require("mongoose");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const validator = require("validator");
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const cloudinary = require("cloudinary").v2;
const requireAuth = require("./middlewares/requireAuth");
const path = require("path");
const fs = require("fs");

//MODELS
const User = require("./models/User");
const Story = require("./models/Story");
const Category = require("./models/Category");
const Language = require("./models/Language");

//CLOUDINARY SETUP
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_SECRET_KEY,
});

const profileOptions = {
  transformation: [
    {
      width: 250,
      height: 250,
      crop: "scale",
      quality: "35",
      fetch_format: "auto",
    },
  ],
};

const StoryCoverOptions = {
  transformation: [
    {
      height: 400,
      width: 300,
      crop: "fill",
      quality: "auto",
      fetch_format: "auto",
    },
  ],
};

const CoverOptions = {
  transformation: [
    {
      height: 450,
      crop: "scale",
      quality: "auto",
      fetch_format: "auto",
    },
  ],
};

//MULTER SETUP
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 1024 * 1024 * 10, // 10MB (adjust this value as needed)
  },
});

//TOKEN CREATION
const createToken = (_id, isAdmin, felhasznalonev) => {
  return jwt.sign({ _id, isAdmin, felhasznalonev }, process.env.SECRET, {
    expiresIn: "3h",
  });
};

//MIDDLEWARES
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));

//HTML PATHS
const htmlEmailPath = path.join(__dirname, "public", "email.html");

//RESET EMAIL FUNCTION
const sendEmail = ({ email, KOD }) => {
  const transporter = nodemailer.createTransport({
    service: process.env.SERVICE,
    auth: {
      user: process.env.EMAIL,
      pass: process.env.PASS,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL,
    to: email,
    subject: "Jelszó helyreállítás",
    html: `
    <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          background-color: #ffffff;
          padding: 20px;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        .container {
          background-color: #f5f5f5;
          padding: 20px;
          border-radius: 30px;
          width: 600px;
        }
        h1 {
          color: #363061;
          text-align: center;
          font-weight: 800;
        }
        h2 {
          color: #f99417;
          text-align: center;
          letter-spacing: 5px;
        }
        p {
          color: #363061;
          line-height: 1.5;
          text-align: center;
        }
        .image {
          display: flex;
          justify-content: center;
          align-items: center;
          text-align: center;
        }
        .image img {
          width: 200px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Jelszó Helyreállítás</h1>
        <div class="image">
          <img
            src="https://res.cloudinary.com/diktrthqs/image/upload/v1704896270/novelnest-blue-min_oyqxy2.png"
            alt=""
            style="display: block; margin: 0 auto"
          />
        </div>
        <p>
          A következő sorban kapott 4 számjegyű kódodat kell megadnod, hogy
          hitelesítsd magad!
        </p>
        <h2>${KOD}</h2>
      </div>
    </body>
  </html>
    `,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log("Hiba az email küldésekor:", error.message);
    } else {
      console.log("Elküldve:", info.response);
    }
  });
};

//SOCKET.IO
const http = require("http");
const { Server } = require("socket.io");
const { Socket } = require("dgram");
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: `http://${process.env.LOCALHOST}:3000`,
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});

io.on("connection", (socket) => {
  //SOCKET.IO MESSAGES
  socket.on("ujHozzaszolas", async (msg) => {
    try {
      const id = msg.id;
      const felhasznalonev = msg.felhasznalonev;
      const hozzaszolas = msg.hozzaszolas;

      await Story.findByIdAndUpdate(
        { _id: id },
        {
          $push: {
            hozzaszolasok: {
              felhasznalonev: felhasznalonev,
              hozzaszolas: hozzaszolas,
            },
          },
        }
      );

      io.emit("success", "Sikeres hozzászólás!");
      const story = await Story.findOne({ _id: id }, { hozzaszolasok: 1 });
      const hozzaszolasok = story.hozzaszolasok;
      io.emit("hozzaszolasok", { id, hozzaszolasok });
    } catch (error) {
      io.emit("error", "Sikertelen hozzászólás!");
    }
  });

  socket.on("hozzaszolasokLeker", async (msg) => {
    try {
      const id = msg;
      const story = await Story.findOne({ _id: id }, { hozzaszolasok: 1 });

      const hozzaszolasok = story.hozzaszolasok;
      io.emit("hozzaszolasok", { id, hozzaszolasok });
    } catch (error) {
      socket.emit("error", "Nem érhetőek el a hozzászólások");
    }
  });

  socket.on("hozzaszolasTorles", async (msg) => {
    try {
      const user = msg.msgNev;
      const comment = msg.msg;
      const id = msg.storyId;

      await Story.findOneAndUpdate(
        { _id: id },
        {
          $pull: {
            hozzaszolasok: { felhasznalonev: user, hozzaszolas: comment },
          },
        },
        { projection: { hozzaszolasok: 1 } }
      );

      io.emit("success", "Sikeres hozzászólás!");
      const story = await Story.findOne({ _id: id }, { hozzaszolasok: 1 });

      const hozzaszolasok = story.hozzaszolasok;
      io.emit("hozzaszolasok", { id, hozzaszolasok });
    } catch (error) {
      socket.emit("error", "Nem érhetőek el a hozzászólások");
    }
  });

  /* FOLLOWING SYSTEM */
  socket.on("bekovetes", async (msg) => {
    try {
      const felhasznalonev = msg.felhasznalonev;
      const viewFelhasznalonev = msg.viewFelhasznalonev;
      const bekovetettuser = await User.findOneAndUpdate(
        { felhasznalonev: viewFelhasznalonev },
        {
          $push: { kovetoim: felhasznalonev },
        }
      );
      const bekovetouser = await User.findOneAndUpdate(
        { felhasznalonev },
        {
          $push: { koveteseim: viewFelhasznalonev },
        }
      );
      const user = await User.findOne(
        { felhasznalonev: viewFelhasznalonev },
        { kovetoim: 1, koveteseim: 1 }
      );

      if (user) {
        const koveteseimProfilkepArray = [];
        const kovetoimProfilkepArray = [];

        for (const koveteseimEmber of user.koveteseim) {
          const koveteseimUser = await User.findOne(
            {
              felhasznalonev: koveteseimEmber,
            },
            { profilkep: 1 }
          );
          if (koveteseimUser) {
            koveteseimProfilkepArray.push(koveteseimUser.profilkep);
          }
        }

        for (const kovetoEmber of user.kovetoim) {
          const kovetoUser = await User.findOne(
            {
              felhasznalonev: kovetoEmber,
            },
            { profilkep: 1 }
          );
          if (kovetoUser) {
            kovetoimProfilkepArray.push(kovetoUser.profilkep);
          }
        }

        let viewKovetoimList = user.kovetoim;
        let viewKoveteseimList = user.koveteseim;
        let viewKovetoimListKep = kovetoimProfilkepArray;
        let viewKoveteseimListKep = koveteseimProfilkepArray;
        io.emit("kovetokUpdate", {
          viewKovetoimList,
          viewKovetoimListKep,
          viewKoveteseimList,
          viewKoveteseimListKep,
          viewFelhasznalonev,
        });
      }
    } catch (error) {}
  });

  socket.on("kikovetes", async (msg) => {
    try {
      const felhasznalonev = msg.felhasznalonev;
      const viewFelhasznalonev = msg.viewFelhasznalonev;

      const bekovetettuser = await User.findOneAndUpdate(
        { felhasznalonev: viewFelhasznalonev },
        {
          $pull: { kovetoim: felhasznalonev },
        }
      );
      const bekovetouser = await User.findOneAndUpdate(
        { felhasznalonev },
        {
          $pull: { koveteseim: viewFelhasznalonev },
        }
      );
      const user = await User.findOne(
        { felhasznalonev: viewFelhasznalonev },
        { koveteseim: 1, kovetoim: 1 }
      );

      if (user) {
        const koveteseimProfilkepArray = [];
        const kovetoimProfilkepArray = [];

        for (const koveteseimEmber of user.koveteseim) {
          const koveteseimUser = await User.findOne(
            {
              felhasznalonev: koveteseimEmber,
            },
            { profilkep: 1 }
          );
          if (koveteseimUser) {
            koveteseimProfilkepArray.push(koveteseimUser.profilkep);
          }
        }

        for (const kovetoEmber of user.kovetoim) {
          const kovetoUser = await User.findOne(
            {
              felhasznalonev: kovetoEmber,
            },
            { profilkep: 1 }
          );
          if (kovetoUser) {
            kovetoimProfilkepArray.push(kovetoUser.profilkep);
          }
        }

        let viewKovetoimList = user.kovetoim;
        let viewKoveteseimList = user.koveteseim;
        let viewKovetoimListKep = kovetoimProfilkepArray;
        let viewKoveteseimListKep = koveteseimProfilkepArray;
        io.emit("kovetokUpdate", {
          viewKovetoimList,
          viewKovetoimListKep,
          viewKoveteseimList,
          viewKoveteseimListKep,
          viewFelhasznalonev,
        });
      }
    } catch (error) {}
  });

  //RATING SYSTEM
  socket.on("newrating", async (msg) => {
    try {
      const id = msg.id;
      const felhasznalonev = msg.felhasznalonev;
      const ertekeles = msg.sajatErtekeles;
      const story = await Story.findOneAndUpdate(
        { _id: id },
        {
          $push: {
            ertekelesek: {
              felhasznalonev: felhasznalonev,
              ertekeles: ertekeles,
            },
          },
        }
      );
      socket.emit("success", "Sikeres értékelés!");

      const ertekelesLekeres = await Story.findOne(
        {
          _id: id,
        },
        { ertekelesek: 1 }
      );
      const osszesErtekelesTomb = ertekelesLekeres.ertekelesek;

      socket.emit("rating", { id, osszesErtekelesTomb });
    } catch (error) {
      socket.emit("error", "Sikertelen értékelés!");
    }
  });

  socket.on("disconnect", () => {});
});

//ROUTES
app.get("/", (req, res) => {
  res.send("Hello World");
});

//REGISTRATION
app.post("/regisztral", async (req, res) => {
  try {
    const { felhasznalonev, email, jelszo } = req.body;
    const emailLetezik = await User.findOne({ email }, { email: 1 });
    const felhasznalonevLetezik = await User.findOne(
      { felhasznalonev },
      { felhasznalonev: 1 }
    );

    if (felhasznalonevLetezik) {
      throw Error("A felhasználónév már létezik!");
    }
    if (emailLetezik) {
      throw Error("Az email már létezik!");
    }
    if (!validator.isEmail(email)) {
      throw Error("Nem jó email formátum!");
    }

    const profilkep =
      "https://res.cloudinary.com/diktrthqs/image/upload/v1699204617/user_wx5ex5.jpg";

    const profilkepNev = "user_wx5ex5";

    const newUser = new User({
      felhasznalonev,
      email,
      jelszo,
      profilkep: profilkep,
      profilkepNev: profilkepNev,
    });
    await newUser.save();
    const token = createToken(
      newUser._id,
      newUser.isAdmin,
      newUser.felhasznalonev
    );

    const transporter = nodemailer.createTransport({
      service: process.env.SERVICE,
      auth: {
        user: process.env.EMAIL,
        pass: process.env.PASS,
      },
    });

    const htmlRegister = fs.readFileSync(htmlEmailPath, "utf8");

    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
      subject: "Sikeres regisztráció",
      text: "Sikeresen regisztráltál a NovelNest oldalára!",
      html: htmlRegister,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log("Hiba az email küldésekor:", error.message);
      } else {
        console.log("Elküldve:", info.response);
      }
    });

    res.status(200).json({
      msg: "Sikeres regisztráció",
      token,
      profilkep,
    });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

//LOGIN
app.post("/belepesJelszo", async (req, res) => {
  try {
    const { felhasznalonev } = req.body;
    const user = await User.findOne(
      { felhasznalonev },
      { felhasznalonev: 1, jelszo: 1 }
    );
    if (!user) {
      throw Error("Ez a felhasználó nincs regisztrálva!");
    }
    const jelszo = user.jelszo;

    res.status(200).json({ msg: jelszo });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

app.post("/belepes", async (req, res) => {
  try {
    const { felhasznalonev } = req.body;
    const user = await User.findOne(
      { felhasznalonev },
      { _id: 1, isAdmin: 1, felhasznalonev: 1, profilkep: 1 }
    );
    const token = createToken(user._id, user.isAdmin, user.felhasznalonev);
    const profilkep = user.profilkep;
    console.log(felhasznalonev, token);
    res.status(200).json({
      msg: "Sikeres belépés",
      token,
      profilkep,
    });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

//RESET
app.post("/emailkuldes", async (req, res) => {
  try {
    const { email } = req.body;
    sendEmail(req.body);
    res.status(200).json({
      msg: `Az azonosító kód el lett küldve a(z) ${email} címre`,
    });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

app.post("/valtoztat", async (req, res) => {
  try {
    const { universalEmail, jelszo, jelszoismetles } = req.body;
    if (!jelszo || !jelszoismetles) {
      throw Error("Nem hagyhatsz üresen cellákat!");
    }
    if (jelszo != jelszoismetles) {
      throw Error("Nem egyezik a két jelszó!");
    }

    const hashedJelszo = await bcrypt.hash(jelszo, 10);
    await User.findOneAndUpdate(
      { email: universalEmail },
      { jelszo: hashedJelszo },
      { new: true }
    );
    res.status(200).json({ msg: "Sikeresen megváltoztattad a jelszavad!" });
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

//AUTHENTICATED ROUTES
app.use(requireAuth);

//PROFILES
app.get(`/userinfo/:felhasznalonevKuld`, async (req, res) => {
  try {
    const felhasznalonev = req.params.felhasznalonevKuld;
    const user = await User.findOne({ felhasznalonev });
    if (user) {
      const koveteseimProfilkepArray = [];
      const kovetoimProfilkepArray = [];

      for (const koveteseimEmber of user.koveteseim) {
        const koveteseimUser = await User.findOne(
          {
            felhasznalonev: koveteseimEmber,
          },
          { profilkep: 1 }
        );
        if (koveteseimUser) {
          koveteseimProfilkepArray.push(koveteseimUser.profilkep);
        }
      }

      for (const kovetoEmber of user.kovetoim) {
        const kovetoUser = await User.findOne(
          { felhasznalonev: kovetoEmber },
          { profilkep: 1 }
        );
        if (kovetoUser) {
          kovetoimProfilkepArray.push(kovetoUser.profilkep);
        }
      }

      const story = await Story.find(
        { szerzo: felhasznalonev },
        { boritokep: 1, cim: 1, szerzo: 1, leiras: 1, isPublished: 1 }
      );

      // legújabb sztori elküldése
      const publicStory = await Story.find(
        {
          szerzo: felhasznalonev,
          isPublished: true,
        },
        { boritokep: 1, cim: 1, szerzo: 1, leiras: 1, createdAt: 1 }
      );
      publicStory.sort((a, b) => b.createdAt - a.createdAt);
      const legujabbStory = publicStory[0];

      res.status(200).send({
        viewFelhasznalonev: user.felhasznalonev,
        viewEmail: user.email,
        viewProfilkep: user.profilkep,
        viewBoritokep: user.boritokep,
        viewRolam: user.rolam,
        viewIsAdmin: user.isAdmin,
        viewKovetoimList: user.kovetoim,
        viewKovetoimListKep: kovetoimProfilkepArray,
        viewKoveteseimList: user.koveteseim,
        viewKoveteseimListKep: koveteseimProfilkepArray,
        viewKovetoim: user.kovetoim.length,
        viewKoveteseim: user.koveteseim.length,
        story: story,
        legujabbStory: legujabbStory,
      });
    } else {
      res.status(404).json({ msg: "A felhasználó nem található" });
    }
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

app.post(`/userinfo/:felhasznalonevKuld`, async (req, res) => {
  const viewFelhasznalonev = req.params.felhasznalonevKuld;
  const felhasznalonev = req.body;
  try {
    const user = await User.findOne(
      {
        felhasznalonev: felhasznalonev.felhasznalonev,
      },
      { koveteseim: 1 }
    );
    if (user.koveteseim.includes(viewFelhasznalonev)) {
      res.status(200).send({
        kovetem: true,
      });
    } else {
      res.status(200).send({
        kovetem: false,
      });
    }
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

//CUSTOMIZING USER PROFILES
app.post("/userupdate", async (req, res) => {
  try {
    const { felhasznalonev, rolam, email, profilkep, boritokep } = req.body;
    const user = await User.findOne(
      { felhasznalonev },
      { boritokepNev: 1, profilkepNev: 1 }
    );
    const profilkepNev = user.profilkepNev;
    const boritokepNev = user.boritokepNev;

    const updateProfilkep = async () => {
      if (profilkep !== "") {
        cloudinary.uploader.upload(
          profilkep,
          profileOptions,
          async (error, result) => {
            if (error) {
              console.log(error);
            }
            if (profilkepNev !== "user_wx5ex5") {
              cloudinary.api
                .delete_resources([profilkepNev], {
                  resource_type: "image",
                  invalidate: true,
                })
                .then(() => console.log("Sikeres profilkép törlés"))
                .catch((error) => console.log(error));
            }
            await User.findOneAndUpdate(
              { felhasznalonev },
              {
                profilkep: result.secure_url,
                profilkepNev: result.public_id,
              }
            );
          }
        );
      }
    };

    const updateBoritokep = async () => {
      if (boritokep !== "") {
        cloudinary.uploader.upload(
          boritokep,
          CoverOptions,
          async (error, result) => {
            if (error) {
              console.log(error);
            }
            if (boritokepNev !== "") {
              cloudinary.api
                .delete_resources([boritokepNev], {
                  resource_type: "image",
                  invalidate: true,
                })
                .then(() => console.log("Sikeres borítókép törlés"))
                .catch((error) => console.log(error));
            }
            await User.findOneAndUpdate(
              { felhasznalonev },
              {
                boritokep: result.secure_url,
                boritokepNev: result.public_id,
              }
            );
          }
        );
      }
    };
    await updateProfilkep();
    await updateBoritokep();

    const updatedUser = await User.findOneAndUpdate(
      { felhasznalonev },
      {
        rolam,
        email,
      }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: "A felhasználó nem létezik!" });
    }

    res.status(200).json(updatedUser);
  } catch (error) {
    console.error(error);
    res.status(500).json({ msg: error.message });
  }
});

//STORY ROUTES
app.post("/addstory", async (req, res) => {
  try {
    const {
      cim,
      szerzo,
      boritokep,
      leiras,
      karakterek,
      nyelv,
      kategoria,
      story,
      isPublished,
    } = req.body;

    const storyLetezik = await Story.findOne({ cim }, { cim: 1 });
    if (storyLetezik) {
      throw Error("Már létezik egy történet ezzel a címmel");
    }

    if (boritokep) {
      cloudinary.uploader.upload(
        boritokep,
        StoryCoverOptions,
        async (error, result) => {
          if (error) {
            console.log(error);
          }

          if (isPublished) {
            const newStory = new Story({
              cim: cim,
              szerzo: szerzo,
              boritokep: result.secure_url,
              boritokepNev: result.public_id,
              leiras: leiras,
              karakterek: karakterek,
              nyelv: nyelv,
              kategoria: kategoria,
              story: story,
              isPublished: isPublished,
            });
            await newStory.save();
          } else {
            const newStory = new Story({
              cim: cim,
              szerzo: szerzo,
              boritokep: result.secure_url,
              boritokepNev: result.public_id,
              leiras: leiras,
              karakterek: karakterek,
              nyelv: nyelv,
              kategoria: kategoria,
              story: story,
              isPublished: isPublished,
            });
            await newStory.save();
          }
          res.status(200).json({ msg: "Sikeres történet létrehozás!" });
        }
      );
    }
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

app.post("/updatestory", async (req, res) => {
  try {
    const {
      paramId,
      cim,
      szerzo,
      boritokep,
      leiras,
      karakterek,
      nyelv,
      kategoria,
      story,
      isPublished,
    } = req.body;
    console.log(isPublished);

    const updatedStory = await Story.findOne(
      { _id: paramId },
      {
        boritokep: 1,
        boritokepNev: 1,
      }
    );
    const boritokepNev = updatedStory.boritokepNev;
    const boritokepLink = updatedStory.boritokep;

    if (boritokep !== boritokepLink) {
      cloudinary.uploader.upload(
        boritokep,
        StoryCoverOptions,
        async (error, result) => {
          if (error) {
            console.log(error);
          }

          if (boritokepNev !== "") {
            cloudinary.api
              .delete_resources([boritokepNev], {
                resource_type: "image",
                invalidate: true,
              })
              .then(() => console.log("Sikeres borítókép törlés"))
              .catch((error) => console.log(error));
          }
          if (isPublished) {
            await Story.findOneAndUpdate(
              { _id: paramId },
              {
                cim: cim,
                szerzo: szerzo,
                boritokep: result.secure_url,
                boritokepNev: result.public_id,
                leiras: leiras,
                karakterek: karakterek,
                nyelv: nyelv,
                kategoria: kategoria,
                story: story,
                isPublished: isPublished,
              }
            );
          } else {
            await Story.findOneAndUpdate(
              { _id: paramId },
              {
                cim: cim,
                szerzo: szerzo,
                boritokep: result.secure_url,
                boritokepNev: result.public_id,
                leiras: leiras,
                karakterek: karakterek,
                nyelv: nyelv,
                kategoria: kategoria,
                story: story,
                isPublished: isPublished,
              }
            );
          }
          res.status(200).json({ msg: "Sikeres történet módosítás!" });
        }
      );
    } else {
      if (isPublished) {
        await Story.findOneAndUpdate(
          { _id: paramId },
          {
            cim: cim,
            szerzo: szerzo,
            leiras: leiras,
            karakterek: karakterek,
            nyelv: nyelv,
            kategoria: kategoria,
            story: story,
            isPublished: isPublished,
          }
        );
      } else {
        await Story.findOneAndUpdate(
          { _id: paramId },
          {
            cim: cim,
            szerzo: szerzo,
            leiras: leiras,
            karakterek: karakterek,
            nyelv: nyelv,
            kategoria: kategoria,
            story: story,
            isPublished: isPublished,
          }
        );
      }
      res.status(200).json({ msg: "Sikeres történet módosítás!" });
    }
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
});

app.get("/story", async (req, res) => {
  try {
    const story = await Story.find(
      { isPublished: true },
      {
        createdAt: 0,
        updatedAt: 0,
        story: 0,
        karakterek: 0,
        isPublished: 0,
        boritokepNev: 0,
        hozzaszolasok: 0,
      }
    );
    res.status(200).json({ story });
  } catch (error) {
    res.status(500).json({ msg: "Valami hiba történt: " + error.message });
  }
});

app.delete("/story", async (req, res) => {
  try {
    const id = req.body.id;
    const toroltAdat = await Story.findOneAndDelete({ _id: id }).exec();
    if (toroltAdat) {
      cloudinary.api
        .delete_resources([toroltAdat.boritokepNev], {
          resource_type: "image",
          invalidate: true,
        })
        .then(() => console.log("Sikeres borítókép törlés"))
        .catch((error) => console.log(error));
      res.status(200).json({ msg: "Sikeres adat törlés!" });
    } else {
      res.status(404).json({ msg: "A történet nem található!" });
    }
  } catch (error) {
    res.status(500).json({ msg: "Valami hiba történt!" });
  }
});

app.post("/onestory", async (req, res) => {
  try {
    const id = req.body.id;
    const onestory = await Story.find(
      { _id: id },
      {
        createdAt: 0,
        updatedAt: 0,
        __v: 0,
        boritokepNev: 0,
      }
    );
    res.status(200).json({ onestory });
  } catch (error) {
    res.status(500).json({ msg: "Valami hiba történt: " + error.message });
  }
});

app.post("/ertekeles", async (req, res) => {
  try {
    const { id, felhasznalonev, Sajatertekeles } = req.body;
    console.log(req.body);
    const ujErtekeles = Number(Sajatertekeles);
    console.log(ujErtekeles);
    const onestory = await Story.findOneAndUpdate(
      { _id: id },
      {
        $push: {
          ertekelesek: {
            ertekeles: ujErtekeles,
          },
        },
      }
    );
    res.status(200).json({ onestory });
  } catch (error) {
    res.status(500).json({ msg: "Valami hiba történt: " + error.message });
  }
});

//COMMENTS
app.post("/hozzaszolas", async (req, res) => {
  try {
    const id = req.body.id;
    const story = await Story.findById(
      { _id: id },
      {
        hozzaszolasok: 1,
      }
    );
    const hozzaszolas = story.hozzaszolasok;
    res.status(200).json({ hozzaszolas });
  } catch (error) {
    res.status(500).json({ msg: "Valami hiba történt: " + error.message });
  }
});

//GETTING DROPDOWNS DATA
app.get("/kategoria", async (req, res) => {
  try {
    const kategoria = await Category.find({});
    res.status(200).json({ kategoria });
  } catch (error) {
    res.status(500).json({ msg: "Valami hiba történt: " + error.message });
  }
});

app.post("/kategoria", async (req, res) => {
  try {
    const { kategoria } = req.body;
    if (kategoria != "") {
      const newCategory = new Category({
        kategoria,
      });
      await newCategory.save();
    }
    res.status(200).json({ msg: "Sikeres feltöltés!" });
  } catch (error) {
    res.status(500).json({ msg: "Valami hiba történt" + error.message });
  }
});

app.get("/nyelv", async (req, res) => {
  try {
    const nyelv = await Language.find({});
    res.status(200).json({ nyelv });
  } catch (error) {
    res.status(500).json({ msg: "Valami hiba történt: " + error.message });
  }
});

app.post("/nyelv", async (req, res) => {
  try {
    const { nyelv } = req.body;
    if (nyelv != "") {
      const newLanguage = new Language({
        nyelv,
      });
      await newLanguage.save();
    }
    res.status(200).json({ msg: "Sikeres feltöltés!" });
  } catch (error) {
    res.status(500).json({ msg: "Valami hiba történt" + error.message });
  }
});

app.get("/getInfos", async (req, res) => {
  try {
    const isAdmin = res.locals.isAdmin;
    const felhasznalonev = res.locals.felhasznalonev;

    const user = await User.findOne(
      { felhasznalonev },
      {
        profilkep: 1,
      }
    );
    const profilkep = user.profilkep;
    res.status(200).json({ isAdmin, felhasznalonev, profilkep });
  } catch (error) {
    res.status(500).json({ msg: "Valami hiba történt: " + error.message });
  }
});

//DATABASE
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Sikeres adatbázis elérés!"))
  .catch(() => console.log(error.message));

const port = process.env.PORT || 3500;
server.listen(port, () => {
  console.log(`http://${process.env.LOCALHOST}:${port}`);
});
