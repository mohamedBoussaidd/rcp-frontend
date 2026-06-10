import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { MatCard, MatCardHeader, MatCardTitle, MatCardContent } from '@angular/material/card';

@Component({
  selector: 'app-methodologie',
  standalone: true,
  templateUrl: './methodologie.component.html',
  styleUrl: './methodologie.component.scss',
  imports: [MatCard, MatCardHeader, MatCardTitle, MatCardContent]
})
export class MethodologieComponent {
  constructor(private router: Router) {}

  retourDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
