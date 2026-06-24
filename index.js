const { Client, GatewayIntentBits, REST, Routes, ApplicationCommandOptionType, ActivityType } = require('discord.js');
const noblox = require('noblox.js');
const http = require('http');

// --- FORCE RENDER WEB SERVER ALIVE ---
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('DMM Bot is running!\n');
}).listen(PORT, () => {
    console.log(`Web server completely active on port ${PORT}`);
});

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;
const ROBLOX_GROUP_ID = process.env.ROBLOX_GROUP_ID; 
const MIN_REQUIRED_ROLE_ID = process.env.MIN_REQUIRED_ROLE_ID; 

const RANKS = { "FREE ACCESS": 2, SOLDATO: 3, CAPO: 4, UNDERBOSS: 5, CONSIGLIERE: 6 };

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const commands = [
    {
        name: 'setrank',
        description: 'Changes a user\'s rank in the Roblox group',
        options: [
            {
                name: 'username',
                description: 'The Roblox username of the player',
                type: ApplicationCommandOptionType.String,
                required: true,
            },
            {
                name: 'rank',
                description: 'Select the target rank',
                type: ApplicationCommandOptionType.Integer,
                required: true,
                choices: [
                    { name: 'Free Access', value: RANKS["FREE ACCESS"] },
                    { name: 'Soldato Access', value: RANKS.SOLDATO },
                    { name: 'Capo Access', value: RANKS.CAPO },
                    { name: 'Underboss Access', value: RANKS.UNDERBOSS },
                    { name: 'Consigliere Access', value: RANKS.CONSIGLIERE }
                ]
            }
        ],
    },
];

// --- BOT LOGIN ---
client.once('ready', async () => {
    console.log(`✅ DISCORD OK: Logged in as ${client.user.tag}`);

    client.user.setActivity({ name: 'DMM Bot', type: ActivityType.Playing });

    // Try Roblox login asynchronously so it NEVER freezes Discord
    (async () => {
        try {
            if (!ROBLOX_COOKIE) {
                console.error("❌ ROBLOX ERROR: Cookie missing from Environment Variables.");
                return;
            }
            await noblox.setOptions({ general: { domain: "roproxy.com" } });
            const currentUser = await noblox.setCookie(ROBLOX_COOKIE);
            console.log(`✅ ROBLOX OK: Connected as ${currentUser.UserName}`);
        } catch (err) {
            console.error("❌ ROBLOX ERROR: Auth failed, but Discord will stay online! Reason:", err.message);
        }
    })();

    // Register commands
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ COMMANDS OK: Slash commands synced.');
    } catch (error) {
        console.error('❌ COMMANDS ERROR:', error);
    }
});

function checkPermissions(member, guild) {
    if (!MIN_REQUIRED_ROLE_ID) return false;
    const targetBaseRole = guild.roles.cache.get(MIN_REQUIRED_ROLE_ID);
    if (!targetBaseRole) return false;
    return member.roles.cache.some(role => role.position >= targetBaseRole.position);
}

// --- PREFIX COMMAND (.rank) ---
client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.toLowerCase().startsWith('.rank')) return;
    const args = message.content.trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === '.rank') {
        if (!checkPermissions(message.member, message.guild)) return message.reply("You do not have permission.");
        const username = args[0];
        let requestedRankName = args.slice(1).join(" ").toUpperCase();

        if (!username || !requestedRankName || !RANKS[requestedRankName]) {
            return message.reply("❌ Use: `.rank [username] [Free Access/Soldato/Capo/Underboss/Consigliere]`");
        }

        const statusMsg = await message.reply("⏳ Ranking...");
        try {
            const userId = await noblox.getIdFromUsername(username.trim());
            await noblox.setRank({ group: Number(ROBLOX_GROUP_ID), target: userId, rank: RANKS[requestedRankName] });
            await statusMsg.edit(`✅ Ranked **${username}** to **${requestedRankName}**!`);
        } catch (err) {
            await statusMsg.edit(`❌ Failed: ${err.message}`);
        }
    }
});

// --- SLASH COMMAND (/setrank) ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'setrank') return;
    if (!checkPermissions(interaction.member, interaction.guild)) {
        return interaction.reply({ content: 'No permission.', ephemeral: true });
    }

    const username = interaction.options.getString('username').trim();
    const rankNum = interaction.options.getInteger('rank');
    await interaction.deferReply();

    try {
        const userId = await noblox.getIdFromUsername(username);
        await noblox.setRank({ group: Number(ROBLOX_GROUP_ID), target: userId, rank: rankNum });
        await interaction.editReply(`✅ Ranked **${username}** successfully!`);
    } catch (err) {
        await interaction.editReply(`❌ Failed: ${err.message}`);
    }
});

client.login(DISCORD_TOKEN);
