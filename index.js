import "dotenv/config";
import { OpenAI } from "openai";
import axios from "axios";
import {exec} from "child_process"
import { URL } from "url";

import inquirer from "inquirer";
import chalk from "chalk";
import boxen from "boxen";
import figlet from "figlet";
import gradient from "gradient-string";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function getWeatherDetailByCityName (city) {
    const url = `https://wttr.in/${city.toLowerCase()}?format=%C+%t`;
    const data = await axios.get(url, { responseType: 'text' });
    return `The weather in ${city} is currently: ${data.data}`;
}

async function getGithubUserDetailByUsername (username) {
    const url = `https://api.github.com/users/${username}`;
    const response = await axios.get(url);
    return JSON.stringify({
        login: response.data.login,
        name: response.data.name,
        bio: response.data.bio,
        public_repos: response.data.public_repos,
        followers: response.data.followers,
        following: response.data.following,
        avatar_url: response.data.avatar_url,
    });
}

async function runCommand (command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                resolve(`Error running command: ${error.message}`);
            } else if (stderr) {
                resolve(`Stderr: ${stderr}`);
            } else {
                resolve(stdout);
            }
        });
    });
}

async function cloneWebsite(url){
    const outputDir = "/";
    const parsed = new URL(url);
    const command = `wget --mirror --convert-links --adjust-extension --page-requisites --no-parent \
     --span-hosts --domains=${parsed.hostname},cdn.jsdelivr.net,fonts.googleapis.com,fonts.gstatic.com \
     --execute robots=off \
     --include-directories=/_next/,/ \
     ${url}`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ Error: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`⚠️ Stderr: ${stderr}`);
        return;
      }
      return JSON.stringify({
        message: `Website cloned successfully to ${outputDir}`,
        output: stdout,
      });
    });
}

const TOOL_MAP = {
    getWeatherDetailByCityName: getWeatherDetailByCityName,
    getGithubUserDetailByUsername: getGithubUserDetailByUsername,
    runCommand: runCommand,
    cloneWebsite: cloneWebsite,
}

// types of prompting
// 1. Zero-shot prompting
// 3. Few-shot prompting
// 4. Chain-of-thought prompting
// 5. Self-consistency prompting
// 2. One-shot prompting
// 2. Persona based prompting

async function main(prompt) {
    const SYSTEM_PROMPT = `
        You are an ai assistant who works on START, THINK and OUTPUT format.
        For given user query first think and breakdown the problem into sub problem.
        You should always keep thinking and thinking before giving the final output.
        Also before outputting the final result to user you must check once     if everything is correct.

        You also have list of available tools that you can call on user query.

        For every tool call that you make, wait for the OBSERVATION fro the tool which is the response from the tool that you called.


        Available Tools: 
        - getWeatherDetailByCityName(city: string): This tool will give you weather details of given city name.
        - getGithubUserDetailByUsername(username: string): Returns the public information about a GitHub user by their username.
        - runCommand(command: string): Takes a unix/linux command as arg and execute on machine and returns the output of command.
        - cloneWebsite(url: string): Takes a website url and clones the website to local machine.

        Rules: 
        - Strictly follow in json format
        - Always follow START, THINK, OBSERVER, TOOL, OUTPUT format
        - Always perform only one step at a time and wait for other step.
        - Always make sure to do multiple step thinking before giving the final output.
        - For every tool call that you make, wait for the OBSERVATION fro the tool which is the response from the tool that you called.

        Output JSON Format: 
        { "step" : "START", "content": "string", "input": "string", "tool_name": "string" }

        Example: 
        User: Hey, what is the weather of patiala?
        ASSISTANT: {"step": "START", "content": "The user is interested in current weather details of patiala."}
        ASSISTANT: {"step": "THINK", "content": "Let me see if there is any available tool for this query."}
        ASSISTANT: {"step": "THINK", "content": "I see there is a tool available which returns current weather data."}
        ASSISTANT: {"step": "THINK", "content": "I need to call getWeatherDetailByCityName for city patiala to get weather details."}
        ASSISTANT: {"step": "TOOL","input": "patiala", "tool_name": "getWeatherDetailByCityName."}
        DEVELOPER: {"step": "OBSERVER","content": "The weather of patiala is cloudy with 27oc"}
        ASSISTANT: {"step": "THINK","content": "Great, I got the weather details of patiala."}
        ASSISTANT: {"step": "OUTPUT","content": "The weather in patiala is 27oC with little cloudy. Please make sure to carry an umbrella if you are going out."}
    `;
    const messages = [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: prompt,
        },
      //   { role: "assistant", "content": JSON.stringify({"step": "START", "content": "User wants me to solve the math expression 4*3*5/3-6+7*9."})},
      //   { role: "assistant", "content": JSON.stringify({"step":"THINK","content":"This expression involves multiplication, division, addition, and subtraction. According to BODMAS/BIDMAS rules, I need to perform multiplication and division first from left to right, then addition and subtraction."})},
      ];

      while(true){
          const response = await openai.chat.completions.create({
            model: "gpt-4.1-mini",
            messages: messages,
          });
          console.log(response.choices[0].message.content);
          const parsedContent = JSON.parse(response.choices[0].message.content);
          messages.push({ role: "assistant", content: response.choices[0].message.content });
          if(parsedContent.step === "START"){
            console.log("🏁 Starting the problem breakdown...");
            continue;
          }else if(parsedContent.step === "THINK"){
            console.log("🧠 Thinking step: ", parsedContent.content);
            continue;
          }else if(parsedContent.step === "OUTPUT"){
            console.log("✅ Final Output: ", parsedContent.content);
            break;
          }else if(parsedContent.step === "TOOL"){
            const toolToCall = parsedContent.tool_name;
            if(!TOOL_MAP[toolToCall]){
                messages.push({ role: "assistant", content: JSON.stringify({"role": "developer", "content": `There is no such tool ${toolToCall}.`}) });
                continue;
            }
            const toolInput = parsedContent.input;
            const resp = await TOOL_MAP[toolToCall](toolInput);
            messages.push({ role: "developer", content: JSON.stringify({"step": "OBSERVER", "content": resp}) });
            console.log("🔧 Tool called: ", toolToCall, " with input: ", toolInput);
            continue;
          }
            
            break;
          }
      console.log("DONE.......")
}



// main();

// Banner
const banner = () =>
  gradient.instagram(
    figlet.textSync("SUMIT CLI", { horizontalLayout: "default" })
  );


async function start() {
  console.clear();
  console.log(banner());
  console.log(
    boxen(
      chalk.bold("Welcome to Sumit CLI") +
        "\nYour friendly terminal assistant ✨",
      { padding: 1, borderStyle: "round", borderColor: "cyan" }
    )
  );

  process.on("exit", () => {
    console.log(
      "\n" +
        boxen(chalk.yellow("👋 You pressed Ctrl+C — Exiting Sumit CLI..."), {
          padding: 1,
          borderStyle: "round",
          borderColor: "red"
        }) +
        "\n"
    );
    process.exit(0);
  });


  // Ask 
  // 
  // questions
  const answers = await inquirer.prompt([
    { name: "name", message: "Enter prompt" },
  ]);

  // Run placeholder
  await main(answers.name);
  exitHandler();
}

function exitHandler() {
  console.log(
    "\n" +
      boxen(chalk.yellow("👋 Exiting Sumit CLI... Goodbye!"), {
        padding: 1,
        borderStyle: "round",
        borderColor: "red"
      }) +
      "\n"
  );
  process.exit(0);
}


start();