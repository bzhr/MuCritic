import * as dotenv from 'dotenv';
import { resolve } from 'path';
import 'reflect-metadata';

import { Log } from './helpers/classes/log';
import { readFileToArray } from './helpers/functions/fileSystem';
import { connectToDatabase } from './helpers/functions/database';
import { ProfileScraper } from './scrapers/rym/profileScraper';

dotenv.config({ path: resolve(__dirname, '../.env') });

/**
 * Scrapes information from [Rate Your Music] directly into a local Postgres database.
 *
 * @remarks
 * - npm call: ```npm run rymScrape```
 * - A single instance of this function will never make more than one request at a time.
 * - Ingests an array of RYM usernames read from a file. File location supplied by CLI argument,
 * ```npm run rymScrape ./rymResources/FILENAME.txt```. Defaults to ```DEFAULT_PROFILE_FILENAME```
 * from env
 */
export async function scrapeRateYourMusicProfiles(): Promise<void> {
    try {
        Log.notify('\nmuCritic RYM Scraper\n\n');
        await connectToDatabase();

        const profileURLList: string[] = await readFileToArray(
            `./resources/${process.argv[2] || process.env.DEFAULT_PROFILE_FILENAME}`,
        );
        Log.log('Beginning scrape...');

        for await(const profileURL of profileURLList) {
            if(profileURL != null && profileURL !== '') {
                const profileScraper = new ProfileScraper(profileURL);
                await profileScraper.scrape(true);
            }
        }
        Log.success('Scrape Complete');
        process.exit(0);
    } catch(err) {
        Log.err(`\n\nmuCritic RYM Scraper Failed!\n\nError:\n${err.message}`);
    }
}

scrapeRateYourMusicProfiles();
