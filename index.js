const { Client, GatewayIntentBits, REST, Routes, ApplicationCommandOptionType, ActivityType } = require('discord.js');
const noblox = require('noblox.js');
const http = require('http');

// --- RENDER KEEP-ALIVE WEB SERVER ---
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('DMM Bot is running smoothly!\n');
}).listen(PORT, () => {
    console.log(`Web server listening on port ${PORT}`);
});

// --- BOT CONFIGURATION ---
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;
const ROBLOX_GROUP_ID = process.env.ROBLOX_GROUP_ID; 
const MIN_REQUIRED_ROLE_ID = process.env.MIN_REQUIRED_ROLE_ID; 

// --- ROBLOX GROUP RANKS ---
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

// Define slash command structure
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

// When the bot comes online
client.once('ready', async () => {
    console.log(`Logged into Discord as ${client.user.tag}`);

    client.user.setActivity({
        name: 'DMM Bot',
        type: ActivityType.Playing
    });

    // STRICT ROBLOX COOKIE AUTHENTICATION
    try {
        const currentUser = await noblox.setCookie(ROBLOX_COOKIE);
        if (!currentUser || !currentUser.UserName) {
            console.error("❌ CRITICAL ERROR: Roblox cookie validation failed. Username is undefined. Your cookie is invalid or expired.");
        } else {
            console.log(`✅ Logged into Roblox successfully as: ${currentUser.UserName}`);
        }
    } catch (err) {
        console.error("❌ CRITICAL ERROR during Roblox login verification:", err.message);
    }

    // Register slash commands
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

// Helper function to validate server hierarchy permissions
function checkPermissions(member, guild) {
    if (!MIN_REQUIRED_ROLE_ID) return false;
    const targetBaseRole = guild.roles.cache.get(MIN_REQUIRED_ROLE_ID);
    if (!targetBaseRole) return false;
    return member.roles.cache.some(role => role.position >= targetBaseRole.position);
}

// --- TEXT-PREFIX COMMAND HANDLER (.rank) ---
client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.toLowerCase().startsWith('.rank')) return;

    const args = message.content.trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === '.rank') {
        if (!checkPermissions(message.member, message.guild)) {
            return message.reply("You do not have a high enough rank to use this command.");
        }

        const username = args[0];
        let requestedRankName = args.slice(1).join(" ").toUpperCase();

        if (!username || !requestedRankName) {
            return message.reply("❌ **Format Incorrect!** Use: `.rank [username] [Free Access/Soldato/Capo/Underboss/Consigliere]`");
        }

        if (!RANKS[requestedRankName]) {
            return message.reply(`❌ **Invalid Rank Name!** Please retype using one of these exact names:\n• \`Free Access\`\n• \`Soldato\`\n• \`Capo\`\n• \`Underboss\`\n• \`Consigliere\``);
        }

        const rankNum = RANKS[requestedRankName];
        const statusMsg = await message.reply("⏳ Processing rank adjustment...");

        try {
            const userId = await noblox.getIdFromUsername(username.trim());
            if (!userId) {
                return await statusMsg.edit(`Could not find a Roblox user named '${username}'.`);
            }

            await noblox.setRank({
                group: Number(ROBLOX_GROUP_ID),
                target: userId,
                rank: rankNum
            });
            
            await statusMsg.edit(`✅ Successfully updated **${username}** to **${requestedRankName}**!`);

        } catch (err) {
            console.error(err);
            await statusMsg.edit(`An error occurred: ${err.message}. Please check if the Roblox cookie is still valid.`);
        }
    }
});

// --- INTERACTION HANDLER (Slash Commands) ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'setrank') {
        if (!checkPermissions(interaction.member, interaction.guild)) {
            return interaction.reply({ 
                content: 'You do not have a high enough rank to use this command.', 
                ephemeral: true 
            });
        }

        const username = interaction.options.getString('username').trim();
        const rankNum = interaction.options.getInteger('rank');

        // Instantly acknowledge to clear the 3-second timeout window
        await interaction.deferReply();

        try {
            const userId = await noblox.getIdFromUsername(username);
            if (!userId) {
                return await interaction.editReply(`Could not find a Roblox user named '${username}'.`);
            }
            
            await noblox.setRank({
                group: Number(ROBLOX_GROUP_ID),
                target: userId,
                rank: rankNum
            });
            
            await interaction.editReply(`Successfully updated **${username}** to your selected rank!`);
            
        } catch (err) {
            console.error(err);
            await interaction.editReply(`An error occurred: ${err.message}. Ensure the bot cookie is valid and has sufficient rank authority.`);
        }
    }
});

client.login(DISCORD_TOKEN);
