import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { getIntrospectionQuery } from 'graphql';
import { runOperation } from '../../api/operation.runner';
import { NgxJsonViewerModule } from 'ngx-json-viewer';


const API_REQUEST = getIntrospectionQuery();

@Component({
  selector: 'app-api-panel',
  imports: [NgxJsonViewerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: 'api-panel.html',
})
export class ApiPanel implements AfterViewInit {
  private readonly apollo = inject(Apollo);

  apiResponse = signal('');
  load() {
    runOperation(this.apollo, gql`${API_REQUEST}`, {}).then((response) => {

      this.apiResponse.set(response.data as string);
    })
  }
  ngAfterViewInit(): void {

    this.load()
  }

}
