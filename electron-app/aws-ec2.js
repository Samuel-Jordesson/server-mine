const { EC2Client, StartInstancesCommand, StopInstancesCommand, DescribeInstancesCommand } = require('@aws-sdk/client-ec2');

function buildClient(cfg) {
    return new EC2Client({
        region: cfg.awsRegion,
        credentials: {
            accessKeyId: cfg.awsAccessKeyId,
            secretAccessKey: cfg.awsSecretAccessKey
        }
    });
}

async function describeInstance(cfg) {
    const client = buildClient(cfg);
    const out = await client.send(new DescribeInstancesCommand({ InstanceIds: [cfg.awsInstanceId] }));
    const instance = out.Reservations?.[0]?.Instances?.[0];
    if (!instance) throw new Error('Instância não encontrada');
    return {
        state: instance.State?.Name, // pending | running | stopping | stopped | ...
        publicIp: instance.PublicIpAddress || null,
        publicDns: instance.PublicDnsName || null
    };
}

async function startInstance(cfg) {
    const client = buildClient(cfg);
    await client.send(new StartInstancesCommand({ InstanceIds: [cfg.awsInstanceId] }));
    return waitUntilRunning(cfg);
}

async function stopInstance(cfg) {
    const client = buildClient(cfg);
    await client.send(new StopInstancesCommand({ InstanceIds: [cfg.awsInstanceId] }));
    return describeInstance(cfg);
}

async function waitUntilRunning(cfg, timeoutMs = 180000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const info = await describeInstance(cfg);
        if (info.state === 'running' && info.publicIp) {
            return info;
        }
        await new Promise((r) => setTimeout(r, 4000));
    }
    throw new Error('Timeout esperando a instância ficar pronta (running + IP público)');
}

module.exports = { describeInstance, startInstance, stopInstance };
