const THEME_PALETTES = [
  {
    name: "Default",
    colors: [
      [13, 43, 69],
      [32, 60, 86],
      [84, 78, 104],
      [141, 105, 122],
      [208, 129, 89],
      [255, 170, 94],
      [255, 212, 163],
      [255, 236, 214],
    ],
  },
  {
    name: "A",
    colors: [
      [34, 34, 34],
      [56, 76, 68],
      [80, 108, 120],
      [128, 110, 95],
      [168, 140, 125],
      [204, 163, 76],
      [240, 230, 215],
      [250, 250, 250]
    ],
  },
  {
    name: "B",
    colors: [
      [25, 24, 59],
      [112, 137, 147],
      [161, 194, 189],
      [237, 240, 240],
    ],
  },
  {
    name: "C",
    colors: [
      [16, 2, 43],
      [36, 0, 70],
      [60, 15, 156],
      [90, 24, 154],
      [123, 44, 191],
      [157, 77, 221],
      [199, 119, 255],
      [224, 170, 255]
    ],
  },
  {
    name: "D",
    colors: [
      [49, 31, 95],
      [22, 135, 167],
      [31, 213, 188],
      [237, 255, 177]
    ],
  },
];

class ImgDissolver {
  constructor(containerId, parentId) {
    this.TARGET_WIDTH = 64;
    this.SCALE = 4;
    this.STAGGER = true;
    this.STAGGER_MS = 2;

    this.container = document.getElementById(containerId);
    this.parent = document.getElementById(parentId);
    if (!this.container || !this.parent)
      throw new Error("Could not find img dissolver elements");

    this.container.innerHTML = "";
    this.container.style.position = "relative";
    this.container.style.transition = `all var(--spring) var(--spring-duration)`;

    this.displayDivs = [];
    this.timeouts = [];
  }

  async loadImageData(domain, base64Image, colors) {
    let cachedData = await getCachedData(domain);
    let meshData, width, height;

    if (!cachedData) {
      const processed = await processImage(base64Image, this.TARGET_WIDTH, colors);
      meshData = processed.meshData;
      width = processed.width;
      height = processed.height;
      await setCachedData(domain, { meshData, width, height });
    } else {
      meshData = cachedData.meshData;
      width = cachedData.width;
      height = cachedData.height;
    }

    this.container.style.transform = `translate(${
      -this.SCALE * (width / 2)
    }px, ${-this.SCALE * (height / 2)}px) scale(${this.SCALE})`;

    this.timeouts.forEach((t) => clearTimeout(t));
    this.timeouts.length = 0;

    while (this.displayDivs.length < meshData.length) {
      const div = document.createElement("div");
      div.style.position = "absolute";
      div.style.top = "0";
      div.style.left = "0";
      div.style.transformOrigin = "top left";
      div.style.width = `1px`;
      div.style.height = `1px`;
      div.style.transform = `translate(${Math.floor(
        Math.random() * width
      )}px, ${Math.floor(Math.random() * height)}px) scale(0)`;
      div.classList.add("block");
      this.container.appendChild(div);
      this.displayDivs.push(div);
    }

    for (let i = 0; i < meshData.length; i++) {
      const mesh = meshData[i];
      let div = this.displayDivs[i];

      const targetTransform = `translate(${mesh.x}px, ${
        mesh.y
      }px) scale(${Math.floor(mesh.width)}, ${Math.floor(mesh.height)})`;
      const targetColor = `rgb(${mesh.color.join(",")})`;

      if (this.STAGGER) {
        this.timeouts.push(
          setTimeout(() => {
            div.style.opacity = "1";
            div.style.backgroundColor = targetColor;
            div.style.transform = targetTransform;
          }, i * this.STAGGER_MS)
        );
      } else {
        div.style.opacity = "1";
        div.style.backgroundColor = targetColor;
        div.style.transform = targetTransform;
      }
    }

    for (let i = meshData.length; i < this.displayDivs.length; i++) {
      const div = this.displayDivs[i];
      div.style.opacity = "0";
      div.style.transform = `translate(${Math.floor(
        Math.random() * width
      )}px, ${Math.floor(Math.random() * height)}px) scale(0)`;
    }
  }
}

class GameManager {
  constructor(apiEndpoint, dissolver) {
    this.apiEndpoint = apiEndpoint;
    this.dissolver = dissolver;

    this.correctGuesses = 0;
    this.incorrectGuesses = 0;
    this.correctAnswer = null;
    this.options = [];
    this.didGuess = false;

    // DOM Elements
    this.scoreCorrectEl = document.getElementById("correct-guesses");
    this.scoreIncorrectEl = document.getElementById("incorrect-guesses");
    this.answerButtons = document.querySelectorAll(".answer-btn");
    this.settingsTopCountEl = document.getElementById("include-sites");
    this.settingsCategoriesEl = document.getElementById("categories");
    this.settingsContainer = document.getElementById("settings-container");
    this.toggleSettingsBtn = document.getElementById("toggle-settings-button");
    this.closeSettingsIcon = document.getElementById("close-settings-icon");
    this.closeSettingsBtn = document.getElementById("close-settings-button");
    this.resetWinsBtn = document.getElementById("reset");
    this.imgDissolver = document.getElementById("img-dissolver");
    this.guessAnnounceContainer = document.getElementById(
      "guess-announce-container"
    );
    this.animationToggles = document.querySelectorAll(
      'input[name="animation-mode"]'
    );
    this.themeOptionsContainer = document.getElementById(
      "theme-options-container"
    );

    this.currentAnimationMode = "linear";
    this.currentThemeName = "Default";
  }

  init() {
    this.loadScores();
    this.loadSettings();
    this.updateScoreDisplay();
    this.setupThemeOptions();
    this.addListeners();
    this.nextGame();
  }

  loadScores() {
    this.correctGuesses = parseInt(
      localStorage.getItem("correctGuesses") || "0"
    );
    this.incorrectGuesses = parseInt(
      localStorage.getItem("incorrectGuesses") || "0"
    );
  }

  saveScores() {
    localStorage.setItem("correctGuesses", this.correctGuesses);
    localStorage.setItem("incorrectGuesses", this.incorrectGuesses);
  }
  updateScoreDisplay() {
    this.scoreCorrectEl.textContent = this.correctGuesses;
    this.scoreIncorrectEl.textContent = this.incorrectGuesses;
  }
  resetWins() {
    this.correctGuesses = 0;
    this.incorrectGuesses = 0;
    this.saveScores();
    this.updateScoreDisplay();
  }

  loadSettings() {
    const savedTopCount = localStorage.getItem("topCount");
    if (savedTopCount) this.settingsTopCountEl.value = savedTopCount;

    const savedCategories = localStorage.getItem("categories");
    if (savedCategories) this.settingsCategoriesEl.value = savedCategories;

    const savedAnim = localStorage.getItem("animationMode");
    if (savedAnim) this.currentAnimationMode = savedAnim;
    document.getElementById(`anim-${this.currentAnimationMode}`).checked = true;
    this.applyAnimationSetting();

    const savedTheme = localStorage.getItem("themeName");
    if (savedTheme) this.currentThemeName = savedTheme;
    this.applyThemeSetting();
  }

  saveSetting(key, value) {
    localStorage.setItem(key, value);
    if (key === "topCount" || key === "categories") {
      this.nextGame();
    }
  }

  applyAnimationSetting() {
    const root = document.documentElement;
    if (this.currentAnimationMode === "spring") {
      root.style.setProperty("--ease-func", "var(--spring)");
      root.style.setProperty("--ease-duration", "var(--spring-duration)");
    } else {
      root.style.setProperty("--ease-func", "var(--linear)");
      root.style.setProperty("--ease-duration", "var(--linear-duration)");
    }
  }

  applyThemeSetting() {
    document.querySelectorAll(".palette-row")?.forEach((row) => {
      row.classList.toggle(
        "selected",
        row.dataset.themeName === this.currentThemeName
      );
    });
  }

  setupThemeOptions() {
    this.themeOptionsContainer.innerHTML = "";

    THEME_PALETTES.forEach((palette) => {
      const row = document.createElement("div");
      row.className = "palette-row";
      row.dataset.themeName = palette.name;

      palette.colors.forEach((rgb) => {
        const block = document.createElement("span");
        block.className = "color-block";
        block.style.backgroundColor = `rgb(${rgb.join(",")})`;
        row.appendChild(block);
      });

      row.addEventListener("click", async () => {
        this.currentThemeName = palette.name;
        
        this.saveSetting("themeName", palette.name);
        this.applyThemeSetting();
        await emptyCacheData();
        this.nextGame();
      });

      this.themeOptionsContainer.appendChild(row);
    });

    this.applyThemeSetting();
  }

  getCurrentPalette() {
    const theme = THEME_PALETTES.find((p) => p.name === this.currentThemeName);
    return theme ? theme.palette : THEME_PALETTES[0].palette;
  }

  toggleSettings(open) {
    if (open) {
      this.settingsContainer.classList.add("open");
    } else {
      this.settingsContainer.classList.remove("open");
    }
  }

  addListeners() {
    this.answerButtons.forEach((btn, index) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handleGuess(btn, index);
      });
    });

    this.toggleSettingsBtn.addEventListener("click", () =>
      this.toggleSettings(true)
    );
    this.closeSettingsIcon.addEventListener("click", () =>
      this.toggleSettings(false)
    );
    this.closeSettingsBtn.addEventListener("click", () =>
      this.toggleSettings(false)
    );
    this.resetWinsBtn.addEventListener("click", () => this.resetWins());
    this.imgDissolver.addEventListener("click", () => this.nextGame());
    this.settingsTopCountEl.addEventListener("change", (e) =>
      this.saveSetting("topCount", e.target.value)
    );
    this.settingsCategoriesEl.addEventListener("change", (e) =>
      this.saveSetting("categories", e.target.value)
    );

    this.animationToggles.forEach((radio) => {
      radio.addEventListener("change", (e) => {
        this.currentAnimationMode = e.target.value;
        this.saveSetting("animationMode", e.target.value);
        this.applyAnimationSetting();
      });
    });
  }

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  async nextGame() {
    this.didGuess = true;
    this.resetButtonStyles();

    try {
      const topCount = this.settingsTopCountEl.value;
      const selectedCategories = [this.settingsCategoriesEl.value].join();

      let apiCallUrl = `${this.apiEndpoint}?rank=${topCount}`;
      if (
        !selectedCategories.includes("all") &&
        selectedCategories.length > 0
      ) {
        apiCallUrl += `&categories=${selectedCategories}`;
      }

      const response = await fetch(apiCallUrl);
      if (!response.ok)
        throw new Error(`API call failed: ${response.statusText}`);

      const data = await response.json();

      if (
        !data.domain ||
        !data.base64Favicon ||
        !data.otherDomains ||
        data.otherDomains.length !== 3
      ) {
        throw new Error("Invalid API response data.");
      }

      this.correctAnswer = data.domain;
      this.options = [data.domain, ...data.otherDomains];
      this.shuffleArray(this.options);
      const colors = THEME_PALETTES.find(theme => theme.name === this.currentThemeName).colors;

      await this.dissolver.loadImageData(data.domain, data.base64Favicon, colors);

      this.answerButtons.forEach((btn, index) => {
        btn.textContent = this.options[index];
        btn.disabled = false;
      });

      this.didGuess = false;
    } catch (error) {
      console.error("Error getting next game:", error);
    }
  }

  handleGuess(clickedButton, index) {
    if (this.didGuess) {
      this.nextGame();
      return;
    }
    this.didGuess = true;
    const selectedOption = this.options[index];

    if (selectedOption === this.correctAnswer) {
      this.correctGuesses++;
      clickedButton.classList.add("correct");
      this.guessAnnounceContainer.classList.add("correct");
      this.guessAnnounceContainer.textContent = "Correct!";
    } else {
      this.incorrectGuesses++;
      clickedButton.classList.add("incorrect");
      this.guessAnnounceContainer.classList.add("incorrect");
      this.guessAnnounceContainer.textContent = "Incorrect!";

      const correctIndex = this.options.indexOf(this.correctAnswer);
      if (correctIndex !== -1) {
        this.answerButtons[correctIndex].classList.add("correct");
      }
    }

    this.saveScores();
    this.updateScoreDisplay();
  }

  resetButtonStyles() {
    this.answerButtons.forEach((btn) => {
      btn.classList.remove("correct", "incorrect");
      btn.disabled = true;
      btn.textContent = "...";
    });
    this.guessAnnounceContainer.classList.remove("correct", "incorrect");
    this.guessAnnounceContainer.innerText = "";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  try {
    const API_ENDPOINT = "/api/next-game";
    const dissolver = new ImgDissolver(
      "img-dissolver-container",
      "img-dissolver"
    );
    const game = new GameManager(API_ENDPOINT, dissolver);
    applyFancyText("title", "SCORE", {});

    game.init();
  } catch (error) {
    console.error("Failed to initialize game:", error);
    document.getElementById(
      "app-container"
    ).innerHTML = `<h1>Error: ${error.message}</h1>`;
  }
});

function applyFancyText(targetId, text, props = {}) {
  const targetElement = document.getElementById(targetId);
  if (!targetElement) {
    return;
  }

  const {
    bounceHeight = 8,
    duration = 5,
    minCharCount = 30,
    chromaOffset = 3,
    skewRange = 32,
    xOffset = 2,
  } = props;

  const rng = (min, max) => (Math.random() * (max - min) + min).toFixed(2);

  const characters = text.split("");
  const count = Math.max(minCharCount, characters.length);

  const mainSpan = document.createElement("span");
  mainSpan.style.color = "white";

  characters.forEach((char, index) => {
    const charSpan = document.createElement("span");
    charSpan.textContent = char;

    const skewX = rng(-skewRange / 2, skewRange / 2);
    const skewY = rng(-skewRange / 2, skewRange / 2);

    const rX = rng(-chromaOffset, chromaOffset);
    const rY = rng(-chromaOffset, chromaOffset);
    const gX = rng(-chromaOffset, chromaOffset);
    const gY = rng(-chromaOffset, chromaOffset);
    const bX = rng(-chromaOffset, chromaOffset);
    const bY = rng(-chromaOffset, chromaOffset);
    const x = rng(-xOffset, xOffset);
    const height = `-${(bounceHeight + Math.random() * 2 - 4).toFixed(2)}px`;

    Object.assign(charSpan.style, {
      display: "inline-block",
      animation: `fancy-text ${duration}s ease-in-out infinite`,
      animationDelay: `${(index / count) * duration}s`,
      transformOrigin: "bottom center",
      whiteSpace: "pre",
    });

    charSpan.style.setProperty("--height", height);
    charSpan.style.setProperty("--skew-x", `${skewX}deg`);
    charSpan.style.setProperty("--skew-y", `${skewY}deg`);
    charSpan.style.setProperty("--red-offset-x", `${rX}px`);
    charSpan.style.setProperty("--red-offset-y", `${rY}px`);
    charSpan.style.setProperty("--green-offset-x", `${gX}px`);
    charSpan.style.setProperty("--green-offset-y", `${gY}px`);
    charSpan.style.setProperty("--blue-offset-x", `${bX}px`);
    charSpan.style.setProperty("--blue-offset-y", `${bY}px`);
    charSpan.style.setProperty("--xoffset", `${x}px`);

    mainSpan.appendChild(charSpan);
  });

  targetElement.innerHTML = "";
  targetElement.appendChild(mainSpan);

  injectFancyTextKeyframes();
}

function injectFancyTextKeyframes() {
  const styleId = "fancy-text-keyframes";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
            @keyframes fancy-text {
                0%, 20% {
                    text-shadow: none;
                    transform: scale(1) translate(0,0) skew(0,0);
                }
                5% {
                    transform: scale(1) translate(0, 1px) skew(0, 0);
                }
                10% {
                    transform: scale(0.98) translate(var(--xoffset), var(--height)) skew(var(--skew-x), var(--skew-y));
                    text-shadow: 
                        var(--red-offset-x) var(--red-offset-y) 1px #ff0000,
                        var(--green-offset-x) var(--green-offset-y) 1px #00ff00,
                        var(--blue-offset-x) var(--blue-offset-y) 0px #0000ff;
                }
                30% {
                    transform: scale(1) translate(calc(-0.5 * var(--xoffset)), calc(-0.5 * var(--height))) skew(3deg, 0);
                }
                60% {
                    transform: scale(1) translate(0, calc(0.5 * var(--height))) skew(0, 0);
                }
            }
        `;
    document.head.appendChild(style);
  }
}
