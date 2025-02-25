const fs = require("fs");
const path = "./coverage/lcov-report/index.html";

// Check if the file exists before reading
if (!fs.existsSync(path)) {
    console.error("Error: Coverage report not found!");
    process.exit(1);
}

const coverageSummary = fs.readFileSync(path, "utf8");

// console.log(coverageSummary);
// Extract the first percentage found in the file
const match = coverageSummary.match(/<span class="strong">\s*([\d.]+)%\s*<\/span>/);
console.log(match)
if (match && match[1]) {
    const coverage = match[1];
    console.log(`Coverage: ${coverage}%`);

    // Generate coverage badge JSON
    const badgeData = {
        schemaVersion: 1,
        label: "coverage",
        message: `${coverage}%`,
        color: coverage >= 80 ? "green" : coverage >= 50 ? "yellow" : "red"
    };

    console.log(JSON.stringify(badgeData, null, 2))
    fs.writeFileSync("badge.json", JSON.stringify(badgeData, null, 2));
    console.log("badge.json created successfully");
}
