const { Client, GatewayIntentBits, REST, Routes, ApplicationCommandOptionType, ActivityType } = require('discord.js');
const noblox = require('noblox.js');
const http = require('http');

// --- MANDATORY FREE RENDER WEB SERVER ---
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('DMM Bot is fully functional and online!\n');
}).listen(PORT, () => {
    console.log(`Render network health-check port active on: ${PORT}`);
});

// --- BOT CONFIGURATION ---
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;
const ROBLOX_GROUP_ID = process.env.ROBLOX_GROUP_ID; 
const MIN_REQUIRED_ROLE_ID = process.env.MIN_REQUIRED_ROLE_ID; 

const RANKS = {
    "FREE ACCESS": 2, 
    SOLDATO: 3,       
    CAPO: 4,          
    UNDERBOSS: 5,     
    CONSIGLIERE: 6    
};

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

client.once('ready', async () => {
    console.log(`Logged into Discord successfully as ${client.user.tag}`);

    client.user.setActivity({
        name: 'DMM Bot',
        type: ActivityType.Playing
    });

    // Run Roblox authentication
    try {
        if (!ROBLOX_COOKIE) {
            console.error("❌ ROBLOX_COOKIE environment variable is completely missing!");
        } else {
            // Forces noblox to use a proxy domain to bypass Render's region block
            await noblox.setOptions({
                general: {
                    domain: "roproxy.com" 
                }
            });
            const currentUser = await noblox.setCookie(ROBLOX_COOKIE);
            console.log(`✅ Logged into Roblox safely via Proxy as user: ${currentUser.UserName}`);
        }
    } catch (err) {
        console.error("❌ Roblox Login Warning:", err.message);
    }

    // Register slash commands globally
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
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
        if (!checkPermissions(message.member, message.guild)) {
            return message.reply("You do not have permission to run this command.");
        }

        const username = args[0];
        let requestedRankName = args.slice(1).join(" ").toUpperCase();

        if (!username || !requestedRankName) {
            return message.reply("❌ Use format: `.rank [username] [Free Access/Soldato/Capo/Underboss/Consigliere]`");
        }

        if (!RANKS[requestedRankName]) {
            return message.reply(`❌ Invalid rank name. Choose from: Free Access, Soldato, Capo, Underboss, Consigliere.`);
        }

        const rankNum = RANKS[requestedRankName];
        const statusMsg = await message.reply("⏳ Adjusting group rank...");

        try {
            const userId = await noblox.getIdFromUsername(username.trim());
            await noblox.setRank({
                group: Number(ROBLOX_GROUP_ID),
                target: userId,
                rank: rankNum
            });
            await statusMsg.edit(`✅ Successfully ranked **${username}** to **${requestedRankName}**!`);
        } catch (err) {
            console.error(err);
            await statusMsg.edit(`❌ Operation failed: ${err.message}`);
        }
    }
});

// --- SLASH COMMAND (/setrank) ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'setrank') {
        if (!checkPermissions(interaction.member, interaction.guild)) {
            return interaction.reply({ content: 'You do not have permission to run this command.', ephemeral: true });
        }

        const username = interaction.options.getString('username').trim();
        const rankNum = interaction.options.getInteger('rank');

        await interaction.deferReply();

        try {
            const userId = await noblox.getIdFromUsername(username);
            await noblox.setRank({
                group: Number(ROBLOX_GROUP_ID),
                target: userId,
                rank: rankNum
            });
            await interaction.editReply(`✅ Successfully ranked **${username}** to your chosen rank!`);
        } catch (err) {
            console.error(err);
            await interaction.editReply(`❌ Operation failed: ${err.message}`);
        }
    }
});

client.login(DISCORD_TOKEN);
