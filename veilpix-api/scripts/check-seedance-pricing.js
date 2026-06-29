const {
    estimateSeedanceKieCredits,
    estimateSeedanceVeilPixCredits
} = require('../utils/seedanceAdapter');

const cases = [
    {
        name: 'Mini 720p, 10s output, image references only',
        options: {
            variant: 'mini',
            resolution: '720p',
            duration: 10,
            hasVideoReference: false,
            referenceVideoDuration: 0
        }
    },
    {
        name: 'Mini 720p, 10s output, 10s video reference',
        options: {
            variant: 'mini',
            resolution: '720p',
            duration: 10,
            hasVideoReference: true,
            referenceVideoDuration: 10
        }
    },
    {
        name: 'Fast 720p, 10s output, 10s video reference',
        options: {
            variant: 'fast',
            resolution: '720p',
            duration: 10,
            hasVideoReference: true,
            referenceVideoDuration: 10
        }
    },
    {
        name: 'Fast 720p, 10s output, 15s video reference',
        options: {
            variant: 'fast',
            resolution: '720p',
            duration: 10,
            hasVideoReference: true,
            referenceVideoDuration: 15
        }
    },
    {
        name: 'Fast 720p, 15s output, image references only',
        options: {
            variant: 'fast',
            resolution: '720p',
            duration: 15,
            hasVideoReference: false,
            referenceVideoDuration: 0
        }
    }
];

for (const item of cases) {
    console.log(item.name);
    console.log({
        kieCredits: estimateSeedanceKieCredits(item.options),
        veilPixCredits: estimateSeedanceVeilPixCredits(item.options)
    });
}
