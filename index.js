const { Client, GatewayIntentBits, REST, Routes, ApplicationCommandOptionType, ActivityType } = require('discord.js');
const noblox = require('noblox.js');

// --- BOT CONFIGURATION (Pulled securely from Render Environment Variables) ---
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;
const ROBLOX_GROUP_ID = process.env.ROBLOX_GROUP_ID; // Loaded as a string/number automatically
const MIN_REQUIRED_ROLE_ID = process.env.MIN_REQUIRED_ROLE_ID; 

// --- ROBLOX GROUP RANKS ---
const RANKS = {
    SOLDATO: 3,       
    CAPO: 4,          
    UNDERBOSS: 5,     
    CONSIGLIERE: 6    
};

// Create Discord Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Define the slash command structure
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

    // Set Bot Activity Status
    client.user.setActivity({
        name: 'DMM Bot',
        type: ActivityType.Playing
    });

    // Authenticate with Roblox safely
    try {
        await noblox.setCookie(ROBLOX_COOKIE);
        console.log(`Logged into Roblox successfully!`);
    } catch (err) {
        console.error("Roblox Login Warning:", err.message);
    }

    // Register slash commands globally
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
        const requestedRankName = args[1]?.toUpperCase();

        if (!username || !requestedRankName) {
            return message.reply("❌ **Format Incorrect!** Use: `.rank [username] [Soldato/Capo/Underboss/Consigliere]`");
        }

        if (!RANKS[requestedRankName]) {
            return message.reply(`❌ **Invalid Rank Name!** Please retype using one of these exact names:\n• \`Soldato\`\n• \`Capo\`\n• \`Underboss\`\n• \`Consigliere\``);
        }

        const rankNum = RANKS[requestedRankName];
        const statusMsg = await message.reply("⏳ Processing rank adjustment...");

        try {
            const userId = await noblox.getIdFromUsername(username.trim());
            if (!userId) {
                return await statusMsg.edit(`Could not find a Roblox user named '${username}'.`);
            }

            await noblox.setRank(Number(ROBLOX_GROUP_ID), userId, rankNum);
            await statusMsg.edit(`✅ Successfully updated **${username}** to **${requestedRankName}**!`);

        } catch (err) {
            console.error(err);
            if (err.message.includes("Permission")) {
                await statusMsg.edit(`The bot lacks permissions. Make sure the bot account is ranked higher than the target rank and has 'Manage Lower Ranks' enabled.`);
            } else {
                await statusMsg.edit(`An error occurred: ${err.message}`);
            }
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

        await interaction.deferReply();

        try {
            const userId = await noblox.getIdFromUsername(username);
            if (!userId) {
                return await interaction.editReply(`Could not find a Roblox user named '${username}'.`);
            }
            
            await noblox.setRank(Number(ROBLOX_GROUP_ID), userId, rankNum);
            await interaction.editReply(`Successfully updated **${username}** to your selected rank!`);
            
        } catch (err) {
            console.error(err);
            if (err.message.includes("Permission")) {
                await interaction.editReply(`The bot lacks permissions. Make sure the bot account is ranked higher than the rank you are giving out, and has 'Manage Lower Ranks' turned on.`);
            } else {
                await interaction.editReply(`An unexpected error occurred while changing rank: ${err.message}`);
            }
        }
    }
});

client.login(DISCORD_TOKEN);