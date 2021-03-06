import { createObjectCsvWriter } from 'csv-writer';

import * as Spotify from 'spotify';

import { RedisHelper } from '../helpers/classes/redis';
import {
    DatabaseEntities,
    TrackEntity,
} from '../entities/entities';

/**
 * Superclass for all data aggregators. Creates a structured method for pulling and normalizing
 * data from the database into usable [[Aggregation]] objects.
 *
 * @typeparam T1 entity used to create an [[Aggregation]]
 * @typeparam T2 [[Aggregation]] format to be created
 */
export class Aggregator<
    T1 extends AggregatableEntities,
    T2 extends Aggregation,
    T3 extends EncodedAggregations,
    T4 extends FlatAggregations,
> {
    /**
     * Database entity that serves as the "base" of the aggregation. For example, this would be an
     * instance of [[ProfileEntity]] for an aggregation of all reviews by a profile
     */
    public entity: T1;

    public aggregationGenerator: AggregationGenerator<T1, T2, T3, T4>;

    public redisClient: RedisHelper;

    public spotifyId: string;

    public constructor(
        entity: T1,
        aggregationGenerator: AggregationGenerator<T1, T2, T3, T4>,
        spotifyId?: string,
    ) {
        this.entity = entity;
        this.aggregationGenerator = aggregationGenerator;
        this.redisClient = RedisHelper.getConnection();
        this.spotifyId = spotifyId;
    }

    /**
     * @param normalized if data in returned aggregation should be normalized using
     * [[EntityAggregator.normalize]]
     */
    public async aggregate(normalized = true): Promise<T2> {
        const redisKey = this.redisKey(normalized);
        if(redisKey != null) {
            const cachedAggregation = await this.redisClient.getObject<T2>(redisKey);
            if(cachedAggregation != null) return cachedAggregation;
        }
        const aggregation = await this.aggregationGenerator.generateFromEntity(
            this.entity,
            normalized,
            this.spotifyId,
        );
        if(redisKey != null) {
            await this.redisClient.setObject(redisKey, aggregation);
        }
        return aggregation;
    }

    /**
     * generates a unique & predictable cache key for the aggregation
     */
    public redisKey(normalized: boolean): string {
        if(this.entity != null && this.entity.id != null) {
            const keyString = `${this.aggregationGenerator.aggregationType}_${this.entity.id}`;
            if(normalized) return `${keyString}_normalized`;
            return keyString;
        }
        return null;
    }

    /**
     * Generate CSV Header objects in accordance with the
     * [CSV Writer npm package](https://www.npmjs.com/package/csv-writer)
     */
    public static csvHeader<
        A1 extends AggregatableEntities,
        A2 extends Aggregation,
        A3 extends EncodedAggregations,
        A4 extends FlatAggregations,
    >(
        aggregationGenerator: AggregationGenerator<A1, A2, A3, A4>,
    ): CsvHeaders {
        const fields = Aggregator.fields(aggregationGenerator);
        return Aggregator.csvHeaderFromArray(fields);
    }

    public static csvHeaderFromArray(fields: string[]): CsvHeaders {
        const headers: CsvHeaders = [];
        for(const field of fields) {
            headers.push({
                id: field,
                title: field,
            });
        }
        return headers;
    }

    /**
     * Gets a list of all fields belonging to an aggreation
     */
    public static fields<
        A1 extends AggregatableEntities,
        A2 extends Aggregation,
        A3 extends EncodedAggregations,
        A4 extends FlatAggregations,
    >(
        aggregationGenerator: AggregationGenerator<A1, A2, A3, A4>,
    ): string[] {
        const blankAggregation = aggregationGenerator.template(0);
        const fields: string[] = [];
        for(const prop in blankAggregation) {
            if(typeof blankAggregation[prop] === 'number') {
                fields.push(prop);
            }
        }
        return fields.sort();
    }

    /**
     * transforms an aggregation object to a simple, storable array in a deterministic manner
     */
    public static stripLabels<
        A1 extends AggregatableEntities,
        A2 extends Aggregation,
        A3 extends EncodedAggregations,
        A4 extends FlatAggregations,
    >(
        aggregation: Aggregation,
        aggregationGenerator: AggregationGenerator<A1, A2, A3, A4>,
    ): A4 {
        const fields = Aggregator.fields(aggregationGenerator);
        const aggregationArr: number[] = [];
        fields.forEach((field): void => {
            if(field in aggregation) {
                aggregationArr.push(aggregation[field]);
            }
        });
        return aggregationArr as A4;
    }

    public static async writeToCsv<
        A1 extends AggregatableEntities,
        A2 extends Aggregation,
        A3 extends EncodedAggregations,
        A4 extends FlatAggregations,
    >(
        aggregation: A2 | A2[],
        aggregationGenerator: AggregationGenerator<A1, A2, A3, A4>,
        fileName: string,
        baseDir: string,
    ): Promise<void> {
        const csvWriter = createObjectCsvWriter({
            path: `${baseDir}/${fileName}.csv`,
            header: Aggregator.csvHeader(aggregationGenerator),
        });
        if(Array.isArray(aggregation)) {
            await csvWriter.writeRecords(aggregation);
        } else {
            await csvWriter.writeRecords([aggregation]);
        }
    }
}

/**
 * Defines how [[Aggregator]] will aggregate information from a resource.
 *
 * @typeparam T1 entity used to create an [[Aggregation]]
 * @typeparam T2 [[Aggregation]] format to be created
 *
 * @remarks
 * See [[AlbumAggregator]] for an example implementations of this interface. It must be exported as
 * a simple object instead of a class, so its methods can be called staticly (static interface
 * methods are not supported by typescript). This needs to be the case so normalization/aggregation
 * calls to methods can be called without instantiating a new class instance, which is very useful.
 */
export interface AggregationGenerator<
    T1 extends AggregatableEntities,
    T2 extends Aggregation,
    T3 extends EncodedAggregations,
    T4 extends FlatAggregations,
> {
    aggregationType: AggregationType;
    flatFields?: string[];
    /**
     * Converts data from a raw format into an [[Aggregation]]
     */
    convertFromRaw(entity: T1): T2;
    encode?(flatAggregation: T4): Promise<T3>;
    flatten?(aggregation: T2, entity?: DatabaseEntities, spotifyId?: string): Promise<T4>;
    /**
     * Aggregates data for an [[Aggregation]]. Implementations consist of two steps
     * 1. Ensure all necessary aggregation data is contained in [[Aggregator.entity]], fetching it
     * if not found.
     * 2. Load all of this data into appropriate [[Aggregation]] (to be returned)
     *
     * @param normalized if data in returned aggregation should be normalized using
     * [[Aggregator.normalize]]
     */
    generateFromEntity(entity: T1, normalized: boolean, spotifyId?: string): Promise<T2>;
    normalize(aggregation: T2): T2;
    template(defaultVal: number): T2;
}

/**
 * Types for data aggregation
 */

export type AggregatableEntities =
    | DatabaseEntities
    | SpotifyTrackFull;

export interface SpotifyTrackFromApi {
    id: null;
    info: Spotify.Track;
    features: Spotify.AudioFeature;
}

export type SpotifyTrackFull =
    | TrackEntity
    | SpotifyTrackFromApi;

export interface TrackAggregation {
    acousticness: number;
    danceability: number;
    duration: number;
    energy: number;
    explicit: number;
    instrumentalness: number;
    liveness: number;
    loudness: number;
    mode: number;
    popularity: number;
    speechiness: number;
    tempo: number;
    timeSignature: number;
    trackNumber: number;
    valence: number;
}

export type EncodedTrack = [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number
];

export type EncodedAlbumTracks = [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number
];

export type EncodedArtistTracks = [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number
];

export type EncodedAlbum = [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number
];

export type EncodedArtist = [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number
];

export type FlatReviewAggregation = [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number
];

export type FlatAlbumAggregation = [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number
];

export type FlatArtistAggregation = [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number
];

export type FlatTrackAggregation = [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number
];

export interface AlbumAggregation {
    availableMarkets: number;
    copyrights: number;
    popularity: number;
    releaseYear: number;
    issues: number;
    lists: number;
    overallRank: number;
    rating: number;
    ratings: number;
    reviews: number;
    yearRank: number;
    artist: ArtistAggregation;
    tracks: EncodedTrack[];
}

export interface ReviewAggregation {
    score: number;
    album: EncodedAlbum;
}

export interface ArtistAggregation {
    active: number;
    discographySize: number;
    lists: number;
    members: number;
    shows: number;
    soloPerformer: number;
    popularity: number;
}

export interface ProfileAggregation {
    age: number;
    gender: number;
    favoriteArtists: ArtistAggregation[];
    reviews: ReviewAggregation[];
}

export type Aggregation =
    | AlbumAggregation
    | ArtistAggregation
    | ReviewAggregation
    | ProfileAggregation
    | TrackAggregation;

export type AggregationType =
    | 'album'
    | 'artist'
    | 'artists'
    | 'review'
    | 'profile'
    | 'track';

export type EncodedAggregations =
    | EncodedTrack
    | EncodedAlbum
    | EncodedArtist;

export type FlatAggregations =
    | FlatAlbumAggregation
    | FlatArtistAggregation
    | FlatReviewAggregation
    | FlatTrackAggregation;

export interface CsvHeader {
    id: string;
    title: string;
}

export type CsvHeaders = CsvHeader[];
