'use client';
import {useId,useRef,useState} from 'react';
import {Check,ChevronsUpDown} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Popover,PopoverContent,PopoverTrigger} from '@/components/ui/popover';
import {Command,CommandEmpty,CommandGroup,CommandInput,CommandItem,CommandList} from '@/components/ui/command';

export default function SchoolPicker({label,value,onChange,options,className='trend-choice'}:{label:string;value:string;onChange:(value:string)=>void;options:{value:string;label:string}[];className?:string}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),id=useId();
 const trigger=useRef<HTMLButtonElement>(null),selected=options.find(o=>o.value===value);
 const matches=options.filter(o=>o.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 return <div className={`${className} school-picker`}><span id={id+'-label'}>{label}</span><Popover open={open} onOpenChange={next=>{setOpen(next);if(next)setQuery('');}}><PopoverTrigger asChild><Button ref={trigger} variant="outline" className="school-picker-trigger" role="combobox" aria-label={label} aria-expanded={open} aria-controls={open?id+'-popup':undefined} aria-haspopup="dialog"><span>{selected?.label??'Choose a school'}</span><ChevronsUpDown size={16}/></Button></PopoverTrigger>{open&&<PopoverContent id={id+'-popup'} align="start" collisionPadding={16} className="school-picker-popup" onCloseAutoFocus={event=>{event.preventDefault();trigger.current?.focus();}}><Command label="Search schools" shouldFilter={false}><CommandInput aria-label="Search schools" placeholder="Search schools…" value={query} onValueChange={setQuery}/><CommandList><CommandEmpty>No matching schools.</CommandEmpty><CommandGroup>{matches.map(option=><CommandItem key={option.value} value={option.value} aria-label={option.label} onSelect={()=>{onChange(option.value);setOpen(false);}}><span>{option.label}</span>{option.value===value&&<Check size={16} aria-hidden="true"/>}</CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent>}</Popover></div>;
}
