import { Component, Inject, OnInit } from "@angular/core";
import { MAT_DIALOG_DATA } from "@angular/material/dialog";
import { Addon } from "app/entities/addon";

@Component({
  selector: "app-addon-detail",
  templateUrl: "./addon-detail.component.html",
  styleUrls: ["./addon-detail.component.scss"],
})
export class AddonDetailComponent implements OnInit {
  addon: Addon;

  constructor(@Inject(MAT_DIALOG_DATA) public data: Addon) {
    this.addon = this.data;
  }

  get defaultImageUrl(): string {
    return this.addon?.screenshotUrls && this.addon?.screenshotUrls[0]
      ? this.addon?.screenshotUrls[0]
      : this.addon?.thumbnailUrl
      ? this.addon?.thumbnailUrl
      : "";
  }

  ngOnInit(): void {}
}
