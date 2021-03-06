/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// tslint:disable:no-new-decorators
import {customElement, html, property} from 'lit-element';
import {styleMap} from 'lit-html/directives/style-map';
import {observable, reaction} from 'mobx';

import {app} from '../core/lit_app';
import {LitModule} from '../core/lit_module';
import {IndexedInput, ModelsMap, Preds, Spec} from '../lib/types';
import {doesOutputSpecContain, findSpecKeys} from '../lib/utils';
import {ClassificationInfo} from '../services/classification_service';
import {ClassificationService} from '../services/services';

import {styles} from './classification_module.css';
import {styles as sharedStyles} from './shared_styles.css';

interface DisplayInfo {
  label: string;
  value: number;
  i: number;
  isGroundTruth?: boolean;
  isPredicted: boolean;
}

/** Model output module class. */
@customElement('classification-module')
export class ClassificationModule extends LitModule {
  static title = 'Classification Results';
  static duplicateForExampleComparison = true;
  static numCols = 3;
  static template = (model = '', selectionServiceIndex = 0) => {
    return html`<classification-module model=${model} selectionServiceIndex=${
        selectionServiceIndex}></classification-module>`;
  };

  static get styles() {
    return [sharedStyles, styles];
  }

  private readonly classificationService =
      app.getService(ClassificationService);

  @observable private labeledPredictions: {[name: string]: DisplayInfo[]} = {};

  firstUpdated() {
    const getSelectedInput = () =>
        this.selectionService.primarySelectedInputData;
    this.react(getSelectedInput, selectedInput => {
      this.updateSelection();
    });
    const getMarginSettings = () =>
        this.classificationService.allMarginSettings;
    this.react(getMarginSettings, margins => {
      this.updateSelection();
    });
    // Update once on init, to avoid duplicate calls.
    this.updateSelection();
  }

  private async updateSelection() {
    const data = this.selectionService.primarySelectedInputData;
    if (data === null) {
      this.labeledPredictions = {};
      return;
    }

    const promise = this.classificationService.getClassificationPreds(
        [data], this.model, this.appState.currentDataset);
    const result = await this.loadLatest('multiclassPreds', promise);
    if (result === null) return;

    this.labeledPredictions = await this.parseResult(result[0], data);
  }

  private async parseResult(result: Preds, data: IndexedInput) {
    // Use the labels parsed from the input specs to add class labels to
    // the predictions returned from the models, to replace simple class
    // indices from the returned prediction arrays.
    // TODO(lit-team): Add display of correctness/incorrectness based on input
    // label.
    const outputSpec = this.appState.currentModelSpecs[this.model].spec.output;
    const multiclassKeys = findSpecKeys(outputSpec, 'MulticlassPreds');
    const predictedKeys = Object.keys(result);
    const labeledPredictions: {[name: string]: DisplayInfo[]} = {};

    for (let predIndex = 0; predIndex < predictedKeys.length; predIndex++) {
      const predictionName = predictedKeys[predIndex];
      if (!multiclassKeys.includes(predictionName)) {
        continue;
      }
      const labelField = outputSpec[predictionName].parent;
      const pred = result[predictionName] as number[];
      const info: ClassificationInfo =
          (await this.classificationService.getResults(
              [data.id], this.model, predictionName))[0];
      const labels: string[] =
          this.classificationService.getLabelNames(this.model, predictionName);
      const labeledExample = pred.map((pred: number, i: number) => {
        const dict: DisplayInfo = {
          value: pred,
          label: labels[i].toString(),
          i,
          isPredicted: i === info.predictedClassIdx
        };
        if (labelField != null && data.data[labelField] === labels[i]) {
          dict.isGroundTruth = true;
        }
        return dict;
      });
      labeledPredictions[predictionName] = labeledExample;
    }
    return labeledPredictions;
  }

  render() {
    const keys = Object.keys(this.labeledPredictions);
    return html`
        ${keys.map((key) => this.renderRow(key, this.labeledPredictions[key]))}
    `;
  }

  private renderRow(fieldName: string, prediction: DisplayInfo[]) {
    // TODO(lit-dev): Align all columns across different prediction heads.
    return html`
        <div class='classification-row-holder'>
          <div class='classification-row-title'>${fieldName}</div>
          <table>
            <tr>
              <th>Class</th>
              <th>Label</th>
              <th>Predicted</th>
              <th>Score</th>
            </tr>
            ${prediction.map((pred) => this.renderClass(fieldName, pred))}
          </table>
        </div>`;
  }

  private renderClass(fieldName: string, pred: DisplayInfo) {
    const numLabels =
        this.classificationService.getLabelNames(this.model, fieldName).length;
    const pad = 0.75;
    const margin = 0.35;
    const style: {[name: string]: string} = {};
    const scale = 100 - 2 * (pad + margin) * numLabels;
    style['width'] = `${scale * pred['value']}%`;
    style['background-color'] = '#07a3ba';
    style['padding-left'] = `${pad}%`;
    style['padding-right'] = `${pad}%`;
    style['margin-left'] = `${margin}%`;
    style['margin-right'] = `${margin}%`;

    const score = pred['value'].toFixed(3);
    return html`
        <tr class='classification-row'>
          <td class='classification-label'>${pred['label']}</td>
          <td>${pred['isGroundTruth'] ? '✔' : ''}</td>
          <td>${pred['isPredicted'] ? '✔' : ''}</td>
          <td class='classification-cell'>
            <div style='${styleMap(style)}'></div>
            <div>${score}</div>
          </td>
        </tr>`;
  }

  static shouldDisplayModule(modelSpecs: ModelsMap, datasetSpec: Spec) {
    return doesOutputSpecContain(modelSpecs, 'MulticlassPreds');
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'classification-module': ClassificationModule;
  }
}
