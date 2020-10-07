import { Injectable } from "@angular/core";
import { CachingService } from "../caching/caching-service";
import { remote } from "electron";
import { join } from 'path';
import { existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { PreferenceStorageService } from "../storage/preference-storage.service";
import { WowUpReleaseChannelType } from "app/models/wowup/wowup-release-channel-type";
import { getEnumList, getEnumName } from "app/utils/enum.utils";
import { WowClientType } from "app/models/warcraft/wow-client-type";
import { AddonChannelType } from "app/models/wowup/addon-channel-type";
import { ElectronService } from "../electron/electron.service";
import { WowUpApiService } from "../wowup-api/wowup-api.service";
import { from, Observable, of, Subject } from "rxjs";
import { LatestVersionResponse } from "app/models/wowup-api/latest-version-response";
import { map, switchMap } from "rxjs/operators";
import { LatestVersion } from "app/models/wowup-api/latest-version";
import * as compareVersions from 'compare-versions';
import { DownloadSevice } from "../download/download.service";
import { PreferenceChange } from "app/models/wowup/preference-change";
import { FileService } from "../files/file.service";
import {
  collapseToTrayKey,
  defaultAutoUpdateKeySuffix,
  defaultChannelKeySuffix,
  lastSelectedWowClientTypeKey,
  telemetryEnabledKey,
  wowupReleaseChannelKey
} from "../../../constants";

const LATEST_VERSION_CACHE_KEY = 'latest-version-response';

@Injectable({
  providedIn: 'root'
})
export class WowUpService {

  private readonly _preferenceChangeSrc = new Subject<PreferenceChange>();

  public readonly updaterName = 'WowUpUpdater.exe';
  public readonly applicationFolderPath: string = remote.app.getPath('userData');
  public readonly applicationLogsFolderPath: string = remote.app.getPath('logs');
  public readonly applicationDownloadsFolderPath: string = join(this.applicationFolderPath, 'downloads');
  public readonly applicationUpdaterPath: string = join(this.applicationFolderPath, this.updaterName);
  public readonly applicationVersion: string;
  public readonly isBetaBuild: boolean;
  public readonly preferenceChange$ = this._preferenceChangeSrc.asObservable();

  constructor(
    private _preferenceStorageService: PreferenceStorageService,
    private _downloadService: DownloadSevice,
    private _electronService: ElectronService,
    private _fileService: FileService,
    private _cacheService: CachingService,
    private _wowUpApiService: WowUpApiService
  ) {
    this.setDefaultPreferences();

    this.applicationVersion = _electronService.remote.app.getVersion();
    this.isBetaBuild = this.applicationVersion.toLowerCase().indexOf('beta') != -1;
  }

  public get updaterExists() {
    return existsSync(this.applicationUpdaterPath);
  }

  public get collapseToTray() {
    const preference = this._preferenceStorageService.findByKey(collapseToTrayKey);
    return preference === 'true';
  }

  public set collapseToTray(value: boolean) {
    const key = collapseToTrayKey;
    this._preferenceStorageService.set(key, value);
    this._preferenceChangeSrc.next({ key, value: value.toString() })
  }

  public get telemetryEnabled() {
    const preference = this._preferenceStorageService.findByKey(telemetryEnabledKey);
    return preference === 'true';
  }

  public set telemetryEnabled(value: boolean) {
    const key = telemetryEnabledKey;
    this._preferenceStorageService.set(key, value);
    this._preferenceChangeSrc.next({ key, value: value.toString() })
  }

  public get wowUpReleaseChannel() {
    const preference = this._preferenceStorageService.findByKey(wowupReleaseChannelKey);
    return parseInt(preference, 10) as WowUpReleaseChannelType;
  }

  public set wowUpReleaseChannel(releaseChannel: WowUpReleaseChannelType) {
    this._preferenceStorageService.set(wowupReleaseChannelKey, releaseChannel);
  }

  public get lastSelectedClientType(): WowClientType {
    const preference = this._preferenceStorageService.findByKey(lastSelectedWowClientTypeKey);
    const value = parseInt(preference, 10);
    return isNaN(value)
      ? WowClientType.None
      : value as WowClientType;
  }

  public set lastSelectedClientType(clientType: WowClientType) {
    this._preferenceStorageService.set(lastSelectedWowClientTypeKey, clientType);
  }

  public getDefaultAddonChannel(clientType: WowClientType): AddonChannelType {
    const key = this.getClientDefaultAddonChannelKey(clientType);
    const preference = this._preferenceStorageService.findByKey(key);
    return parseInt(preference, 10) as AddonChannelType;
  }

  public setDefaultAddonChannel(clientType: WowClientType, channelType: AddonChannelType) {
    const key = this.getClientDefaultAddonChannelKey(clientType);
    this._preferenceStorageService.set(key, channelType);
  }

  public getDefaultAutoUpdate(clientType: WowClientType): boolean {
    const key = this.getClientDefaultAutoUpdateKey(clientType);
    const preference = this._preferenceStorageService.findByKey(key);
    return preference === true.toString();
  }

  public setDefaultAutoUpdate(clientType: WowClientType, autoUpdate: boolean) {
    const key = this.getClientDefaultAutoUpdateKey(clientType);
    this._preferenceStorageService.set(key, autoUpdate);
  }

  public showLogsFolder() {
    this._fileService.showDirectory(this.applicationLogsFolderPath);
  }

  public isUpdateAvailable(): Observable<boolean> {
    const releaseChannel = this.wowUpReleaseChannel;

    return this.getLatestWowUpVersion(releaseChannel)
      .pipe(
        map(response => {
          if (!response?.version) {
            console.error("Got empty WowUp version");
            return false;
          }

          if (this.isBetaBuild && releaseChannel != WowUpReleaseChannelType.Beta) {
            return true;
          }

          return compareVersions(response.version, this._electronService.remote.app.getVersion()) > 0;
        })
      );
  }

  public getLatestWowUpVersion(channel: WowUpReleaseChannelType): Observable<LatestVersion> {
    const cachedResponse = this._cacheService.get<LatestVersionResponse>(LATEST_VERSION_CACHE_KEY);
    if (cachedResponse) {
      return of(channel === WowUpReleaseChannelType.Beta ? cachedResponse.beta : cachedResponse.stable);
    }
    return this._wowUpApiService.getLatestVersion()
      .pipe(
        map(response => {
          this._cacheService.set(LATEST_VERSION_CACHE_KEY, response);
          return channel === WowUpReleaseChannelType.Beta ? response.beta : response.stable;
        })
      );
  }

  public getLatestUpdaterVersion() {
    return this._wowUpApiService.getLatestVersion()
      .pipe(
        map(response => {
          return response.updater;
        })
      );
  }

  public installUpdate() {
    // TODO
  }

  public checkUpdaterApp(onProgress?: (progress: number) => void): Observable<void> {
    if (this.updaterExists) {
      return of(undefined);
    } else {
      return this.installUpdater(onProgress);
    }
  }

  private installUpdater(onProgress?: (progress: number) => void): Observable<void> {
    return this.getLatestUpdaterVersion()
      .pipe(
        switchMap(response => from(this._downloadService.downloadZipFile(response.url, this.applicationDownloadsFolderPath, onProgress))),
        switchMap(downloadedPath => {
          const unzipPath = join(this.applicationDownloadsFolderPath, uuidv4());
          return from(this._downloadService.unzipFile(downloadedPath, unzipPath));
        }),
        switchMap(unzippedDir => {
          console.log(unzippedDir);
          const newUpdaterPath = join(unzippedDir, this.updaterName);
          return from(this._downloadService.copyFile(newUpdaterPath, this.applicationUpdaterPath));
        }),
        map(() => {
          console.log('DOWNLOAD COMPLETE')
        })
      )
  }

  private setDefaultPreference(key: string, defaultValue: any) {
    let pref = this._preferenceStorageService.findByKey(key);
    if (!pref) {
      this._preferenceStorageService.set(key, defaultValue.toString());
    }
  }

  private getClientDefaultAddonChannelKey(clientType: WowClientType) {
    const typeName = getEnumName(WowClientType, clientType);
    return `${typeName}${defaultChannelKeySuffix}`.toLowerCase();
  }

  private getClientDefaultAutoUpdateKey(clientType: WowClientType): string {
    const typeName = getEnumName(WowClientType, clientType);
    return `${typeName}${defaultAutoUpdateKeySuffix}`.toLowerCase();
  }

  private setDefaultPreferences() {
    this.setDefaultPreference(collapseToTrayKey, true);
    this.setDefaultPreference(wowupReleaseChannelKey, this.getDefaultReleaseChannel());
    this.setDefaultClientPreferences();
  }

  private setDefaultClientPreferences() {
    const keys = getEnumList<WowClientType>(WowClientType).filter(key => key !== WowClientType.None);
    keys.forEach(key => {
      const preferenceKey = this.getClientDefaultAddonChannelKey(key);
      this.setDefaultPreference(preferenceKey, AddonChannelType.Stable);

      const autoUpdateKey = this.getClientDefaultAutoUpdateKey(key);
      this.setDefaultPreference(autoUpdateKey, false);
    });
  }

  private getDefaultReleaseChannel() {
    return this.isBetaBuild ? WowUpReleaseChannelType.Beta : WowUpReleaseChannelType.Stable;
  }
}